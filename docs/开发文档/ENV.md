# 环境变量说明（ENV Reference）

> **目的**：与 `apps/server/.env.example` 保持一一对应。每加一个变量，先改 `.env.example`，再同步本文档。
>
> **维护机制**：执行 `pnpm env:check` 校验两边的 key 集合是否一致（key 多或缺失都会报错）。
>
> **同步原则**：本地默认值、dev 默认值、生产建议值、安全注意 —— 每个变量都给出。

---

## 1. 数据库

### `DATABASE_URL`（**必填**）

- **用途**：Prisma / 应用层连接 PostgreSQL 的连接串
- **格式**：`postgresql://用户名:密码@主机:端口/数据库名`
- **dev 默认**：`postgresql://user:password@localhost:5433/mono_dev`（docker compose 端口映射 5433→5432）
- **生产建议**：使用专用账号，密码 32 位以上随机串；推荐走 PgBouncer 连接池
- **安全注意**：
    - 不要提交到 Git
    - 密码含特殊字符需 URL encode（如 `@` → `%40`）
    - 生产环境建议使用只读账号给报表查询

### `DIRECT_URL`（可选）

- **用途**：Prisma migrate / introspection 使用的直连地址（绕过 PgBouncer）
- **dev 默认**：留空 → 复用 `DATABASE_URL`
- **生产建议**：必须配置。PgBouncer 的 transaction pool 模式会破坏 Prisma migrate 的 advisory lock，必须直连
- **安全注意**：直连地址权限应高于普通 `DATABASE_URL`（至少能 DDL）

---

## 2. Redis

### `REDIS_URL`（dev 可选，**生产必填**）

- **用途**：应用层 Redis 连接（缓存、限流、Session、分布式锁）
- **dev 默认**：`redis://localhost:6379`
- **生产建议**：`rediss://:password@host:6379/0`（启用 TLS + 密码）
- **安全注意**：
    - 不配置时降级为内存缓存（开发环境可接受，**生产环境绝对不能降级**）
    - 内存缓存在多实例部署时会出现"缓存不一致 / 重复限流"问题

---

## 3. JWT 认证

### `JWT_SECRET`（**生产必填**）

- **用途**：签发与验证 JWT Token 的 HS256 密钥
- **dev 默认**：`dev-secret-do-not-use-in-production-change-me-please-add-more-chars-here-1234`（占位，禁止生产使用）
- **生成**：`openssl rand -hex 32`
- **生产建议**：64 字符（256 bit = 32 字节）；独立于其他密钥；定期轮换
- **安全注意**：
    - 泄漏后必须立即轮换，否则攻击者可以伪造任意 token
    - 轮换时建议保留 24h 灰度期（双密钥验证）

### `JWT_ACCESS_TTL`（可选）

- **用途**：Access Token 有效期（秒）
- **dev 默认**：`900`（15 分钟）
- **生产建议**：`900` ~ `3600`（15 分钟 ~ 1 小时）。越短越安全，但刷新越频繁

### `JWT_REFRESH_TTL`（可选）

- **用途**：Refresh Token 有效期（秒）
- **dev 默认**：`604800`（7 天）
- **生产建议**：`604800`（7 天）~ `2592000`（30 天）
- **安全注意**：配合 token rotation + family detection 防重放（详见 [0003-token-rotation.md](./adr/0003-token-rotation.md)）

### `JWT_ISSUER`（可选）

- **用途**：JWT payload 的 `iss` 字段
- **dev 默认**：`monorepo-server`
- **生产建议**：改成你的服务标识（多服务部署时区分用）

### `JWT_AUDIENCE`（可选）

- **用途**：JWT payload 的 `aud` 字段
- **dev 默认**：`monorepo-app`
- **生产建议**：同上，区分客户端类型（web / app / admin）

---

## 4. 限流

### `THROTTLE_LOGIN_TTL`（可选）

- **用途**：登录失败的限流窗口（秒）
- **dev 默认**：`900`（15 分钟）

### `THROTTLE_LOGIN_LIMIT`（可选）

- **用途**：登录失败限流窗口内的最大失败次数
- **dev 默认**：`5`
- **生产建议**：5 次/15 分钟（OWASP 推荐值）
- **安全注意**：超过 10 次/15 分钟对正常用户不友好；低于 3 次/15 分钟容易被攻击者 DoS 合法用户

### `THROTTLE_IP_LIMIT`（可选）

- **用途**：单 IP 全局请求上限（次/秒）
- **dev 默认**：`50`
- **生产建议**：根据业务压测调整

---

## 5. AES 加密

### `AES_ENCRYPTION_KEY`（**生产必填**）

- **用途**：加密数据库中敏感字段（OAuth access_token / refresh_token 等）
- **dev 默认**：`0000000000000000000000000000000000000000000000000000000000000000`（全 0 方便本地测试）
- **生成**：`openssl rand -hex 32`
- **生产建议**：64 位 hex 字符串，独立于 JWT secret
- **安全注意**：
    - 轮换代价极高：改变 key 会让所有已加密的字段无法解密
    - 建议从一开始就 KMS 管理（AWS KMS / 阿里云 KMS）

### `BCRYPT_ROUNDS`（可选）

- **用途**：bcrypt 密码哈希成本因子
- **可选值**：`10` — `15`
- **dev 默认**：`12`
- **生产建议**：12（OWASP 2024 推荐），CPU 充足可调高到 13-14
- **安全注意**：值越大越安全但越慢（12 ≈ 300ms，15 ≈ 3s），需权衡

---

## 6. 服务

### `PORT`（可选）

- **用途**：HTTP 监听端口
- **dev 默认**：`3000`
- **生产建议**：由反向代理 / K8s 决定

### `NODE_ENV`（**必填**）

- **用途**：运行环境标识
- **可选值**：`development` | `production` | `test`
- **dev 默认**：`development`（异常响应包含完整堆栈）
- **生产建议**：`production`

---

## 7. Cookie 安全

### `COOKIE_SECURE`（**生产必填**）

- **用途**：accessToken / refreshToken cookie 的 Secure 标志
- **dev 默认**：`false`
- **生产建议**：`true`（强制 HTTPS 防 cookie 泄漏）
- **安全注意**：12-Factor App 原则：不要从 NODE_ENV 推断，必须显式配置

### `CSRF_SECRET`（**生产必填**）

- **用途**：CSRF Double Submit Cookie 模式的 token 密钥
- **dev 默认**：`dev-csrf-secret-change-in-production`
- **生成**：`openssl rand -hex 32`
- **生产建议**：64 位 hex 字符串，独立于 JWT_SECRET

### `CSRF_COOKIE_SECURE`（**生产必填**）

- **用途**：csrf-token cookie 的 Secure 标志
- **dev 默认**：`false`
- **生产建议**：`true`
- **安全注意**：使用 `__Host-` 前缀时必须为 `true`（浏览器强制 HTTPS）

---

## 8. CORS 跨域

### `CORS_ORIGINS`（**生产必填**）

- **用途**：允许跨域的前端 origin 列表
- **dev 默认**：`http://localhost:5173,http://localhost:5174,http://localhost:3000`
- **生产建议**：只列真实域名，多个用逗号分隔
- **安全注意**：
    - 留空时 dev 模式 fallback 到 localhost，prod 模式拒绝所有跨域请求
    - 不要使用 `*`（会破坏 credential 携带）
- **旧名兼容**：`ALLOWED_ORIGINS` 是历史配置名，现已统一为 `CORS_ORIGINS`，新部署不要使用

---

## 9. 反向代理

### `TRUSTED_PROXIES`（可选）

- **用途**：Express trust proxy 配置 + MetricsIpGuard IP 白名单
- **留空**：不启用 trust proxy（直连部署时正确）
- **CIDR 列表**（如 `10.0.0.0/8,172.16.0.0/12`）：信任指定网段的代理，用于 MetricsIpGuard 判断 X-Forwarded-For 是否可信
- **数值**（如 `1`）：信任前 N 层代理（Express trust proxy 语义）
- **生产建议**：Nginx / ALB / CloudFront 后署时配 CIDR 列表
- **安全注意**：值过大会让攻击者伪造 X-Forwarded-For 绕过 IP 限流

---

## 10. 日志

### `LOG_LEVEL`（可选）

- **用途**：日志级别
- **可选值**：`debug` | `log` | `warn` | `error`
- **dev 默认**：`debug`
- **生产建议**：`log` 或 `warn`
- **安全注意**：debug 级别会打印 SQL 参数、token 头、cookie 内容，生产绝对不能开

---

## 11. Prometheus 监控

### `PROMETHEUS_ENABLED`（可选）

- **用途**：是否暴露 /metrics 端点
- **dev 默认**：留空 → `false`
- **生产建议**：`true`（仅在内网，配合 MetricsIpGuard）
- **安全注意**：暴露到公网会被攻击者推断系统状态

---

## 12. 文件存储

### `STORAGE_DRIVER`（可选）

- **用途**：文件存储驱动选择
- **可选值**：`local` | `s3`
- **dev 默认**：`local`
- **生产建议**：`s3`（配合对象存储服务）

### `STORAGE_LOCAL_DIR`（可选）

- **用途**：本地文件存储目录
- **dev 默认**：`./uploads`
- **生产建议**：用对象存储（OSS / S3），不要用本地磁盘

### `STORAGE_PUBLIC_BASE_URL`（可选）

- **用途**：文件公开访问的 URL 前缀
- **dev 默认**：`/uploads`
- **生产建议**：CDN 域名

---

## 13. Turnstile（人机验证）

### `TURNSTILE_SITE_KEY`（可选）

- **用途**：前端渲染 Turnstile widget 的公钥
- **dev 默认**：留空
- **安全注意**：主配置走 `system_config.turnstile.config`（DB），本环境变量仅作降级 fallback

### `TURNSTILE_SECRET_KEY`（可选）

- **用途**：服务端校验 token
- **dev 默认**：留空 → 跳过校验
- **安全注意**：同上为降级 fallback

---

## 同步校验

执行 `pnpm env:check` 校验本文档与 `apps/server/.env.example` 的 key 集合是否一致。
