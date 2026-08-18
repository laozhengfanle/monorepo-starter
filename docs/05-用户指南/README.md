# 用户指南

> 面向新加入 monorepo-starter 的开发者 / 使用者。从零上手 → 架构理解 → 模块索引 → 配置 → 扩展 → 部署运维 → 排障 → 版本记录，按顺序阅读体验最佳。

**项目**：企业级全栈 monorepo starter —— Nx 23 + pnpm 11 · NestJS 11 (Express + GraphQL Code-First) · React 19 (Vite 8 + antd 6 + TanStack Query) · Prisma 7 (PostgreSQL + UUIDv7)

---

## 指南目录

| #   | 文档                           | 内容                                                                                         | 适合                   |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------- |
| 01  | [快速上手](./01-快速上手.md)   | 环境准备 → 安装 → 配置 → 数据库初始化 → 启动 → 验证 + 常见坑                                 | 所有新人，**先读这篇** |
| 02  | [架构总览](./02-架构总览.md)   | apps/packages 分层、前后端数据流、GraphQL 为主 REST 为辅的决策、模块边界                     | 需要理解设计的人       |
| 03  | [模块参考](./03-模块参考.md)   | 后端 13 个业务模块 + 公共基建 + 前端 features 职责索引                                       | 定位/修改代码时        |
| 04  | [配置参考](./04-配置参考.md)   | 全部环境变量、Docker 编排变量、Nx 配置、如何改端口                                           | 调环境/端口/部署参数时 |
| 05  | [扩展指南](./05-扩展指南.md)   | 三步新增业务功能：后端模块 → 契约 → 前端页面（公告模块完整示例）                             | 要加新功能时           |
| 06  | [部署运维](./06-部署运维.md)   | Docker 构建、compose dev/prod、K8s、健康检查、日志、Prometheus 指标                          | 部署/运维时            |
| 07  | [故障排查](./07-故障排查.md)   | 12 类常见问题：端口/数据库/schema 不更新/orval 过期/catalog/登录锁定/Redis 降级/边界 lint 等 | 出问题时               |
| 08  | [Changelog](./08-Changelog.md) | 版本管理规则 + 模板 + v0.1.25 近期变更摘要 + 发布流程                                        | 发版本时               |

## 60 秒速览

```bash
# 环境：Node >= 22.18（推荐 24）、pnpm 11.21.0
pnpm install
cp apps/server/.env.example apps/server/.env

# 数据库（需本地 PG，或 docker compose up -d postgres）
cd apps/server && pnpm exec prisma migrate dev && pnpm exec prisma db seed && cd ../..

# 启动（两个终端）
pnpm exec nx serve server    # http://localhost:3301（Swagger: /api-docs）
pnpm exec nx serve admin     # http://localhost:3302（登录 admin）

# 质量门禁
pnpm build && pnpm test && pnpm lint && pnpm typecheck
```

## 常用命令速查

| 命令                                                      | 作用                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm exec nx serve server` / `serve admin`               | 启动后端 / 前端（开发模式）                                         |
| `pnpm build` / `test` / `lint` / `typecheck` / `e2e`      | 全仓构建 / 测试 / 检查 / 类型 / 端到端                              |
| `pnpm lint:boundaries`                                    | ESLint Nx 模块边界检查                                              |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:studio` | 数据库迁移 / 生产迁移 / 种子 / Studio                               |
| `pnpm generate:api`                                       | orval 重新生成 REST client（先跑 `nx run server:generate-openapi`） |
| `pnpm erd:generate`                                       | 重新生成 ER 图                                                      |
| `pnpm bump`                                               | 版本递增 + 提交 + 打标签（v0.1.25 起）                              |

## 开发文档索引（docs/）

| 文档                                                     | 内容                                      |
| -------------------------------------------------------- | ----------------------------------------- |
| [开发文档/项目总览.md](../01-架构与设计/项目总览.md)     | 项目背景与目标                            |
| [开发文档/技术架构.md](../01-架构与设计/技术架构.md)     | 技术选型与架构设计                        |
| [开发文档/目录结构.md](../01-架构与设计/目录结构.md)     | 目录结构详解（含生成物说明）              |
| [开发文档/API设计规范.md](../02-开发规范/API设计规范.md) | API 设计规范（GraphQL/REST/契约）         |
| [ARCHITECTURE.md](../01-架构与设计/ARCHITECTURE.md)      | 认证 / 限流 / 审计三大链路 Mermaid 流程图 |
| [erd.md](../erd.md)                                      | 数据库 ER 图（`pnpm erd:generate` 生成）  |
| [命名规范.md](../02-开发规范/命名规范.md)                | 数据库 / 后端 / 前端命名与工程规范        |

## 关键约定（易踩坑提醒）

- **依赖治理**：`pnpm-workspace.yaml` 开启 `catalogMode: strict`，新依赖必须先在 catalog 登记（见 07-故障排查 §5）；
- **契约流程**：改后端 DTO/schema → `nx run server:generate-openapi` → `pnpm generate:api`，生成物入库（见 05 / 07）；
- **GraphQL schema**：`graphql/schema.gql` 是启动时自动生成的生成物，改 Resolver 后需重启 server（见 07 §3）；
- **版本管理**：`apps/admin/src/app/version.ts` 单一来源，用 `pnpm bump` 维护，勿手改（见 08）。
