# BFF 架构规范

## 一句话

**GraphQL 是通用数据网关，REST 是前端专属胶水层。** 新加入的开发者看到文件名就知道代码属于哪个体系。

## 目录约定

### 后端（`apps/server/src/`）

```
src/
  modules/               ← GraphQL 数据模型层（通用 CRUD，不碰 HTTP）
    auth/                 → 认证 service + resolver + strategy
    admin/                → 角色/菜单/账户/审计 resolver + service
    account/              → 账户数据
    dashboard/            → 仪表盘聚合
    ...

  bff/                    ← REST 胶水层（前端专属 HTTP 端点）
    admin/                → 管理后台专用
      auth/               → POST /admin/auth/login
      uploads/            → /upload/*
    public/               → 公开端点（无需认证）
      docs/               → GET /project-docs/*
    # 将来：
    # mobile/             → 移动端专用 REST
    # web/                → C 端专用 REST

  common/                 ← 跨层共享（guards / filters / pipes / decorators / services）
  metrics/                ← Prometheus（基础设施）
  tasks/                  ← 定时任务
```

**规则**：

- `modules/` 下的文件只关心数据模型和业务逻辑，不关心 HTTP method / Cookie / Header。它们输出的是 service + GraphQL resolver。
- `bff/admin/` 下的 controller 才能直接碰 `@Req()` `@Res()` `@Post()` `@UseInterceptors()`。
- 新建前端 → 新建 `bff/<端名>/`。
- 跨端共享的 REST 端点（如 `/auth/refresh`、`/auth/logout`）留在 `modules/auth/`，不归属任何一个 BFF。

### 前端（`apps/admin/src/`、`apps/web/src/`）

```
src/
  api/
    graphql/              ← GraphQL query/mutation（调后端 modules/）
      auth.ts             → me 查询
      accounts.ts         → 账户 CRUD
      ...
    bff/                   ← REST 调用（调后端 bff/admin/）
      auth.ts             → login / refresh / logout
      uploads.ts          → 文件上传
      docs.ts             → 文档读取

  shared/
    request/              ← HTTP 传输层（fetch 封装、CSRF、401 刷新）
```

**规则**：

- `@/api/graphql/*` → 走 `gqlQuery()`，只调 `POST /graphql`
- `@/api/bff/*` → 走 `post()` / `get()` / 原生 `fetch()`，调 REST 端点
- `shared/request/` 只放传输层逻辑（超时、CSRF、401 重试），不写业务

## 为什么需要这个拆分

### 1. 目录自解释

新同事 fork 项目后，不用问"这个接口该放哪"——

- 查数据、改数据 → `modules/` + GraphQL resolver
- admin 后台专用的 REST 端点 → `bff/admin/`
- 前端 REST 调用代码 → `api/bff/`

### 2. 端点职责清晰，防越权

REST controller 和 GraphQL resolver 在不同目录，review 时一眼看出这个端点有没有越界——

- `bff/` 下的 controller 不得直接操作数据库（走 service）
- `modules/` 下的 resolver 不得读写 `req.cookies`

### 3. 多端扩展不污染

将来接入移动端、小程序、第三方 API：

- 后端加 `bff/mobile/` 放 mobile 专用 REST
- 前端加 `api/bff/mobile/` 对应
- 各自的 controller 互不干扰，不会出现"admin 接口被 member 误用"的问题

## 反模式（不要这样做）

- ❌ 在 `modules/` 里写带 `@Req()` `@Res()` `Set-Cookie` 的 controller — 那是 BFF 层的事
- ❌ 在 `bff/` 里直接调 Prisma — BFF 是胶水层，数据操作走 service
- ❌ 在 `api/` 里同时导出 REST 和 GraphQL 函数 — 拆到 `api/bff/` vs `api/graphql/`
- ❌ 复制粘贴跨端的 REST 端点 — 共享端点留在 `modules/auth/` 等公共位置

## 迁移指南

存量代码已按上述结构重构（2026-06-17）。新模块参照现有写法：

1. 如果只是 CRUD 数据 → 在 `modules/` 加 GraphQL resolver
2. 如果是 admin 专用的"导出 Excel / 上传文件 / 聚合统计 / 操作类接口" → 在 `bff/admin/` 加 REST controller
3. 前端对应在 `api/bff/` 加调用函数
