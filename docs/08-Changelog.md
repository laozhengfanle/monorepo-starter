# 08 变更日志

> **目标**：升级基座前必看——记录每个版本的**破坏性变更**、**新增能力**、**需要手动操作**的清单。
> 格式：`<日期> <版本> <类型>`。类型：
> - `破坏` —— 不兼容，必须改代码
> - `新增` —— 新能力，可选用
> - `修复` —— bug 修复
> - `记录` —— 仅记录，不影响代码

---

## v1.2.0 — 当前版本

**发布日期**：2026-06-18

### 新增

- Docker 开发环境：docker compose watch 源码同步 + SWC 实时编译接入
- Prisma 编译链路优化：prisma generate → nest build → compile-prisma-client 三阶段

### 修复

- OAuth refreshToken cookie path 修正（`/auth` → `/api/auth`），修复 OAuth 用户无法刷新令牌
- OAuth 访问令牌补齐 tokenVersion + jti，与 AuthService.issueTokens 对齐
- 生产 Dockerfile prune 阶段完成，去除 devDependencies 缩减镜像体积
- 全量审计修复（40 项）：安全、配置一致性、CI/CD、K8s、代码质量

### 记录

- pnpm catalog 配置、Prettier 去重、env-check 路径修正、nginx real_ip 收紧等 10+ 项配置治理

---

## v1.1.0

**发布日期**：2026-06-17

### 新增

- 基础脚手架完工：管理后台 + C 端 + NestJS 后端，GraphQL + REST 双协议
- 认证：账号密码 + 短信验证码 + 第三方登录（微信 web、小程序、Apple）
- 双端 RBAC：管理端（admin/*）和 C 端（member/*）镜像结构，互不干扰
- 权限缓存：Redis 两级缓存（角色级 + 账户级），支持 grant / deny
- CSRF：Double Submit Cookie 模式，支持 `__Host-` 前缀
- 限流：3 级 Throttler + 登录端点独立限流 + LoginLock 防爆破
- 缓存：Redis 主 + 内存降级（RedisDegradationService）
- 审计日志：批量写入（50 条/5s），失败回滚到 NDJSON
- 文件上传：本地存储，可扩展 S3
- 短信 / 邮件：Provider 接口，可切换 driver（默认 mock）
- Prometheus 指标：HTTP / GraphQL / DB / 业务 4 个 collector
- 健康检查：liveness + readiness + 综合 /health
- 优雅关闭：SIGTERM 触发按序关闭
- GraphQL Schema Artifact：build 时生成 SDL 提交到 Git，CI 校验一致性
- 多端共用 Zod schema：`@packages/shared` 统一前后端校验
- Tailwind 4 + Naive UI（管理后台 / C 端）
- 多阶段 Dockerfile + 生产 docker-compose（non-root / read-only / cap_drop）

### 记录

- 包名仍为 `monorepo-starter`（v1.1.0），对外品牌名 MonoKit
- 默认账号：`root` / `Root!123`（管理端），`zhangsan` / `Test!123`（C 端）
- 默认端口：server 3000 / admin 5173 / web 5174

---

## 升级指南

### 从 v1.0.x 升到 v1.1.0

> 暂无 v1.0 之前版本，本节预留给后续版本。

### 一般升级步骤

1. **看本文档顶部"破坏性变更"**：确认有没有影响你的代码
2. **看 [08-Changelog.md](./08-Changelog.md)**：找本版本的所有变更
3. **拉新代码**：

   ```bash
   git fetch upstream
   git merge upstream/main
   ```

4. **重装依赖**：

   ```bash
   pnpm install
   ```

5. **跑迁移**：

   ```bash
   pnpm -F @apps/server db:migrate
   ```

6. **重跑 seed**：

   ```bash
   pnpm -F @apps/server db:seed
   ```

7. **跑闸门**：

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```

8. **重启 dev / 重部署**：

   ```bash
   pnpm dev
   # 或
   docker compose -f docker-compose.prod.yml up -d
   ```

---

## 兼容性承诺

| 项 | 承诺 |
|---|---|
| 错误码（`packages/shared/src/errors/error-codes.ts`） | **稳定 API**，只在末尾追加，永不删/改语义 |
| 公开 REST 端点（`/api/auth/*`、`/api/uploads/*`） | **稳定 API**，只加不删 |
| 公开 GraphQL query / mutation | **稳定 API**，废弃会先标 `@deprecated` 至少一个 minor 版本 |
| 公开 Zod schema | **稳定 API**，加字段兼容、删字段不兼容 |
| 后端内部模块（`apps/server/src/common/`、`modules/<domain>/*`） | **不承诺**——fork 后你改了的话，升级可能冲突 |
| 前端内部模块（`apps/admin/src/shared/`、`app/`） | **不承诺**——同上 |
| Prisma schema | **不承诺**——基座可能加表/字段，但不会删你的表 |
| Dockerfile / docker-compose | **不承诺**——基座可能改编排 |
