# monorepo-starter

企业级全栈 monorepo starter：**Nx + pnpm workspace + NestJS (Fastify) + React 19 (Vite) + Ant Design**。

## 技术栈

| 层 | 选型 |
|---|---|
| 单仓编排 | [Nx](https://nx.dev) 23 + pnpm 11 workspaces |
| 后端 | NestJS 11 + Fastify（zod-first 契约、Swagger、Orval 代码生成） |
| 前端 | React 19 + Vite 8 + Ant Design 6 + TanStack Query |
| 数据 | Prisma 6（PostgreSQL，分页/软删除扩展） |
| Lint | oxlint（代码规则，Rust 极速）+ ESLint（仅 Nx 模块边界规则） |
| 测试 | Vitest 4 + Playwright（80% 覆盖率阈值） |

## 目录结构

```
apps/
  server/       NestJS + Fastify API（@starter/server，端口 3301）
  admin/        React SPA 管理端（@starter/admin，端口 3302）
  admin-e2e/    Playwright 端到端测试
packages/
  shared/
    contracts/    共享契约：envelope、分页、DTO schema（zod）——前后端单一事实来源
    server-core/  后端基建：业务异常、全局异常过滤器、Swagger 装配
    test-utils/   共享测试工具（renderWithRouter 等）
docs/           规划与规范文档
```

内部包统一使用 `@starter/*` scope + `workspace:*` 协议；依赖版本统一由 [pnpm-workspace.yaml](pnpm-workspace.yaml) 的 `catalog` 管理（`catalogMode: strict`）。

## 快速开始

```bash
# 环境要求：Node >= 22.18（推荐 24）、pnpm 11
pnpm install

# 开发
pnpm exec nx serve server       # http://localhost:3301（Swagger: /api-docs，JSON: /api-docs-json）
pnpm exec nx serve admin         # http://localhost:3302

# 构建 / 测试 / 检查
pnpm build
pnpm test
pnpm lint
pnpm typecheck

# 端到端测试（自动拉起 web）
pnpm e2e
```

## 常用命令

```bash
pnpm exec nx graph                 # 查看项目依赖图
pnpm exec nx affected -t build     # 只构建受影响的项目（CI 用法）
pnpm exec nx g @nx/react:lib my-lib --directory=packages/shared/my-lib   # 生成新库
```

## 端口

本仓库按顺序编号分配端口（3301 起），避开常见开发端口与本地其他项目冲突：

| 应用 | 端口 | 修改位置 |
|---|---|---|
| server | 3301 | [apps/server/.env](apps/server/.env) 的 `PORT` |
| admin | 3302 | [apps/admin/vite.config.mts](apps/admin/vite.config.mts) 的 `server.port` |

新增应用依次使用 3303、3304…；前端代理后端用环境变量（`VITE_API_BASE_URL`），不硬编码端口。

## 约定

- **API 响应**：成功响应直接返回领域数据（与 [openapi/openapi.json](openapi/openapi.json) 的 200 schema 一致）；失败响应统一 envelope `{ success: false, error: { code, message, details? } }`（见 [packages/shared/contracts](packages/shared/contracts/src/lib/api-envelope.ts)）
- **契约变更流程**：改后端 DTO/schema 后，依次运行 `pnpm exec nx run server:generate-openapi`（重新发射 OpenAPI）→ `pnpm generate:api`（orval 重新生成前端 client），再提交生成产物
- **命名规范**：见 [docs/命名规范.md](docs/命名规范.md)（数据库、后端、前端）
- **目录结构**：见 [docs/命名规范.md](docs/命名规范.md)（apps 按业务端组织、feature-first、复用下沉规则）
- **Lint 分层**：`pnpm lint` = oxlint 全仓代码规则（毫秒级，无需按项目缓存）；`pnpm lint:boundaries` = ESLint 只跑 `@nx/enforce-module-boundaries` 与 `@nx/dependency-checks`（oxlint 无法运行 Nx 自定义规则）。边界约束定义在 [eslint.config.mjs](eslint.config.mjs) 的 `depConstraints`（`scope:shared` 只依赖共享层；`scope:admin`/`scope:member`/`scope:server` 只能依赖本端 + 共享层）
- **模块边界**：项目 tags（`scope:web` / `scope:shared` / `type:app` …）；前端只从 `@starter/api-client` 获取领域模型与校验 schema，不直接依赖 `@starter/contracts`

## Roadmap

- [x] 骨架：Nx + pnpm workspace、catalog、契约种子包、CI
- [x] oxlint 接管代码规则 + ESLint 边界检查分层
- [x] NestJS + Fastify API（zod 契约、env fail-fast、health/users CRUD、Swagger、e2e，覆盖率 100%）
- [x] OpenAPI 发射 + Orval 生成 react-query client
- [x] ui 库（antd 主题）+ web 管理页
- [ ] Prisma db 库
