# MonoKit 架构流程图

> **目的**：用 Mermaid 流程图直观展示认证、限流、审计三大核心链路。
> 与 [docs/02-架构总览.md](./02-架构总览.md) 互补：02 讲模块边界，本文讲数据流。

---

## 1. 项目鸟瞰

MonoKit 是 **NestJS 11 后端 + Vue 3 双端 SPA** 的企业级基座。三大基础设施链路（认证 / 限流 / 审计）通过 **app.module.ts** 全局注册，对业务模块透明：

- **认证**：JWT（access 15min + refresh 7d） + httpOnly Cookie + CSRF Double Submit Cookie
- **限流**：3 档 throttler（1s/10s/60s）+ 登录锁（账号 + IP 维度）+ 公开端点白名单
- **审计**：同步写业务上下文 + 50 条/5s 批量 flush + NDJSON 兜底

所有业务模块（admin / member / iam / dashboard）都共用同一套基础设施，业务代码无需感知。

---

## 2. 认证链路（登录 → JWT 签发 → 守卫校验 → Controller）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户浏览器
    participant FE as Admin/Web SPA
    participant CSRF as CSRF Middleware
    participant RL as GqlAwareThrottlerGuard
    participant JG as JwtAuthGuard
    participant AS as AuthService
    participant PG as Prisma / PostgreSQL
    participant RD as Redis

    Note over U,RD: ① 登录（POST /api/admin/auth/login）
    U->>FE: 输入用户名 + 密码 + Turnstile
    FE->>CSRF: POST /api/admin/auth/login
    CSRF->>CSRF: 豁免（CSRF_EXEMPT_PATHS）
    CSRF->>RL: 进入控制器前
    RL->>RL: 5 次/300s（@Throttle long）
    RL->>AS: authService.adminLogin()
    AS->>PG: 查 account + identity
    AS->>AS: bcrypt.compare 校验密码
    AS->>AS: 登录锁：recordFailure / resetOnSuccess
    AS->>AS: 签发 access + refresh（含 jti + tokenVersion）
    AS->>RD: 写 refresh slot（CAS 占位）
    AS->>PG: 写 audit_log
    AS-->>FE: Set-Cookie: accessToken + refreshToken + csrf-token
    AS-->>FE: 200 { code: 0, data: { csrfToken } }

    Note over U,RD: ② 后续业务请求（GraphQL mutation）
    U->>FE: 触发 mutation
    FE->>CSRF: 写请求带 X-CSRF-Token header
    CSRF->>CSRF: 校验 cookie == header
    CSRF->>RL: 进入 resolver 前
    RL->>JG: throttler 通过
    JG->>JG: 提取 JWT（header / cookie）
    JG->>AS: JwtStrategy.validate(payload)
    AS->>RD: isRevoked(jti) ?
    AS->>PG: account.tokenVersion === payload.tokenVersion ?
    JG->>JG: request.user = { accountId, userType }
    JG-->>FE: 200 / GraphQL data
```

**关键点**：

- 登录响应一次性下发 **3 个 Cookie**（accessToken + refreshToken + csrf-token）
- 写请求必须带 `X-CSRF-Token` header（前端 `request.ts` 自动注入）
- JWT 校验有两道关：`jti 黑名单` + `tokenVersion 一致性`
- refresh token 通过 Redis Lua 脚本做 CAS 防并发

---

## 3. 限流链路（Throttler → 登录锁 → 公开端点白名单）

```mermaid
flowchart TD
    A[请求进入] --> B{是 GraphQL?}
    B -->|是| C[GqlAwareThrottlerGuard<br/>从 GqlExecutionContext 取 IP]
    B -->|否| D[默认 ThrottlerGuard<br/>从 req.ip 取 IP]

    C --> E{命中 3 档限流?}
    D --> E
    E -->|short: 1s/3| F[429 拒绝]
    E -->|medium: 10s/20| F
    E -->|long: 60s/100| F
    E -->|未命中| G{是登录端点?}

    G -->|是| H[LoginLockService<br/>账号 + IP 维度计数]
    G -->|否| I{是 @Public 端点?}

    H --> H1{失败 ≥ 5 次?}
    H1 -->|是| H2[锁定 15 分钟<br/>抛 21001]
    H1 -->|否| I

    I -->|是| J[放行]
    I -->|否| K[JwtAuthGuard]

    K --> K1{token 有效?}
    K1 -->|否| L[401 20003]
    K1 -->|是| M[AdminPermissionGuard]

    M --> M1{是 @RequireAuth?}
    M1 -->|否| J
    M1 -->|是| M2{有 @Permission?}

    M2 -->|否| N[403 缺装饰器]
    M2 -->|是| M3{角色是 super_admin?}
    M3 -->|是| J
    M3 -->|否| M4{权限码命中?}
    M4 -->|是| J
    M4 -->|否| O[403 无权访问]

    style F fill:#ff6b6b
    style H2 fill:#ff6b6b
    style L fill:#ff6b6b
    style N fill:#ff6b6b
    style O fill:#ff6b6b
    style J fill:#51cf66
```

**关键点**：

- **3 档限流**：1s/3（防刷）+ 10s/20（防并发）+ 60s/100（防爬）
- **登录锁**独立于 throttler，按账号 + IP 维度记录，5 次失败锁 15 分钟
- **公开端点白名单**：登录 / refresh / logout / csrf-token 等不需要 token
- **超管短路**：super_admin 角色直接放行，绕过所有权限码校验

---

## 4. 审计链路（业务调用 → Audit Service → 批量缓冲 → DB 写 / NDJSON 兜底）

```mermaid
flowchart LR
    A[业务 Service] -->|await auditService.record| B[AuditService]

    B --> C{通道选择}
    C -->|批量模式<br/>默认 true| D[AuditBatchService<br/>50 条/5s 缓冲]
    C -->|立即模式<br/>敏感操作| E[直接 Prisma 写]

    D --> D1{缓冲区满 / flush 触发?}
    D1 -->|否| D2[保留在内存 Array]
    D1 -->|是| D3[Prisma auditLog.createMany]

    D3 -->|成功| D4[清空缓冲区]
    D3 -->|失败| D5[写入 NDJSON 兜底文件<br/>logs/audit-fallback.ndjson]

    E -->|成功| F[(PostgreSQL audit_log)]
    E -->|失败| D5

    D4 --> F
    D5 --> G[下次启动时<br/>replay NDJSON → DB]

    H[onApplicationShutdown] -->|优雅关闭| D
    H -->|强制 flush| D3

    style F fill:#339af0
    style G fill:#fab005
    style D5 fill:#ff6b6b
```

**关键点**：

- **批量缓冲**：默认 50 条 / 5s flush 一次，减少 DB 写压力
- **NDJSON 兜底**：DB 写失败时落到 `logs/audit-fallback.ndjson`，下次启动重放
- **优雅关闭**：`onApplicationShutdown` 触发强制 flush，避免进程被杀丢数据
- **敏感操作走立即模式**：登录失败、改密、软删等关键事件不走批量

---

## 5. 三链路协作

```mermaid
flowchart TD
    REQ[HTTP/GraphQL 请求] --> RL[限流链路]
    RL -->|通过| AUTH[认证链路]
    AUTH -->|通过| PERM[权限链路]
    PERM -->|通过| CTRL[Controller]
    CTRL --> SVC[Service 业务逻辑]
    SVC --> AUDIT[审计链路]
    SVC --> CACHE[缓存读写]
    SVC --> DB[(PostgreSQL)]

    AUTH -.记录登录失败.-> AUDIT
    RL -.记录限流触发.-> AUDIT
    PERM -.记录权限拒绝.-> AUDIT
    SVC -.记录业务操作.-> AUDIT

    style AUTH fill:#4dabf7
    style RL fill:#ffa94d
    style PERM fill:#9775fa
    style AUDIT fill:#51cf66
```

---

## 6. 相关代码

| 链路 | 关键文件 |
|------|----------|
| 认证 | [apps/server/src/modules/auth/auth.service.ts](../apps/server/src/modules/auth/auth.service.ts) / [jwt.strategy.ts](../apps/server/src/modules/auth/jwt.strategy.ts) / [csrf.middleware.ts](../apps/server/src/common/middleware/csrf.middleware.ts) |
| 限流 | [apps/server/src/common/guards/gql-aware-throttler.guard.ts](../apps/server/src/common/guards/gql-aware-throttler.guard.ts) / [login-lock.service.ts](../apps/server/src/modules/auth/login-lock.service.ts) |
| 审计 | [apps/server/src/modules/audit/audit.service.ts](../apps/server/src/modules/audit/audit.service.ts) / [audit-batch.service.ts](../apps/server/src/common/audit/audit-batch.service.ts) |
| 权限 | [apps/server/src/common/guards/admin-permission.guard.ts](../apps/server/src/common/guards/admin-permission.guard.ts) |
