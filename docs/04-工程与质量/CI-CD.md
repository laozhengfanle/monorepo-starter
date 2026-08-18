# CI-CD

> 本文介绍仓库的持续集成与发布流水线：4 个 GitHub Actions workflow（ci / docs / release / deploy）的职责、触发条件与关键步骤，以及本地复现检查命令。Workflow 定义在 `.github/workflows/`。

## 1. 流水线总览

| Workflow      | 触发                                                       | 职责                                                                                    |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ci.yml`      | push main + PR                                             | lint + typecheck + test + build + e2e + 依赖审计 + Docker 构建 + Trivy 镜像扫描         |
| `docs.yml`    | push main（限 docs 相关路径）+ 手动                        | 生成 ERD / OpenAPI / TypeDoc → 发布 GitHub Pages                                        |
| `release.yml` | 推送 tag `v*.*.*`                                          | 构建 server/admin 镜像推 GHCR + 发布 GitHub Release                                     |
| `deploy.yml`  | 仅手动（workflow_dispatch，指定 environment 与 image_tag） | 构建 server/admin/migration 镜像推 GHCR + SSH 部署（迁移先行）+ 健康检查 + 失败自动回滚 |

依赖方向：`ci` 是合入门槛；`release` 在打 tag 时产出镜像；`deploy` **自带构建**（与 release 是双路径，同一 tag 可能被两边各构建一次，属预期行为），只由人工 dispatch 触发并带环境白名单（staging/production）与镜像 tag 必填校验。所有 workflow 遵循最小权限原则（`permissions` 显式声明）。

## 2. ci.yml — 合入质量门禁

Job 1（lint-test-build）：基于 **Nx affected** 增量执行（`nx-set-shas` 计算 base/head）：

1. 安装：`pnpm install --frozen-lockfile`（pnpm 11.21 + Node 24，矩阵预留多版本）；
2. `pnpm lint`（oxlint 代码规则）→ `pnpm lint:boundaries`（ESLint 模块边界）；
3. `pnpm audit --audit-level=high`：依赖安全审计，high 及以上阻断；
4. 先跑 `pnpm exec nx run @starter/api-client:generate-api` 生成契约 client（确定性产物）；
5. `pnpm exec nx affected -t test build typecheck`（80% 覆盖率阈值在此生效）；
6. `playwright install --with-deps chromium` → `nx affected -t e2e`。

Job 2（build-and-scan）：`docker/build-push-action` 构建 server/admin 镜像（不 push）→ **Trivy 扫描**（severity CRITICAL/HIGH，`exit-code: 1` 阻断）→ SARIF 上传 GitHub Security。CI 失败即合入阻断，本地必须复现通过（见第 6 节）。

## 3. docs.yml — 文档站点

- 触发：push main 且改动涉及 `apps/server/**`、`packages/**`、`docs/**`、`openapi/**`，或手动 dispatch；
- 生成三步：
  - `pnpm exec nx run server:generate-openapi` → OpenAPI spec；
  - `pnpm erd:generate` → `docs/erd.md`（mermaid，无需 puppeteer）；
  - `pnpm exec typedoc --entryPoints packages/shared/contracts/src/index.ts --entryPoints packages/shared/server-core/src/index.ts --out docs/api-reference` → TypeDoc；
- 组装 `docs-site/` 后 deploy 到 **GitHub Pages**（需在仓库设置开启 Pages，Source: GitHub Actions）；
- 文档站点地址：`https://<owner>.github.io/<repo>/`。

## 4. release.yml — 镜像与 Release

- 触发：推送 tag `v*.*.*`（版本号经 `pnpm bump` 提升，见《项目总览.md》）；
- Job 1（build-and-push）：登录 GHCR（`GITHUB_TOKEN`）→ `docker/metadata-action` 生成 tag（`vX.Y.Z` + short sha + latest）→ 构建并 push `ghcr.io/{owner}/monorepo-starter-server` / `-admin`；
- Job 2（publish-release）：发布 GitHub Release（含 changelog 与镜像信息）；
- 只负责**构建和发布制品**，部署由 deploy.yml 负责。

## 5. deploy.yml — SSH 部署与回滚

- 触发：**仅 `workflow_dispatch`**（不是 tag 推送）；可指定 `environment`（staging/production，白名单校验，非法值直接失败）与 `image_tag`（必填，禁止 latest）；
- Job 1：**自带 build + push** 镜像到 GHCR（server / admin / migration，与 release 双路径；migration 是 `--target migration` 阶段，专供发布期跑 DB 迁移）；
- Job 2（deploy）：确定镜像 tag（仅手动输入，未提供即失败）→ `appleboy/ssh-action` 执行脚本：

```bash
# 1) 拉新镜像 → 2) 【前置】用 migration 镜像跑 prisma migrate deploy（失败即中止）
# 3) 备份当前 tag（回滚用）→ 4) docker compose up
# 5) 健康检查：等待后统计 healthy 服务数，< 2 则回滚到上一个 tag 并 exit 1
# 6) 清理 7 天前的 dangling 镜像
```

- 当前是**占位实现**：SSH 主机/用户/密钥来自 secrets（`SSH_HOST`/`SSH_USER`/`SSH_KEY`），生产部署目标待定；
- `concurrency` 保证同一 ref 不并行部署；部署失败自动回滚，避免坏版本停留在线上。

## 6. 本地复现检查

提交/合入前本地跑齐 CI 的第一道门禁：

```bash
pnpm lint               # oxlint 代码规则
pnpm lint:boundaries    # ESLint 模块边界（Nx enforce-module-boundaries）
pnpm typecheck          # 全仓类型检查（依赖 api-client 生成产物，必要时先 pnpm generate:api）
pnpm test               # 单测/集成（覆盖率 80% 阈值）
pnpm build              # 全仓构建（验证产物可产出）
pnpm e2e                # Playwright e2e（本地需先 playwright install）
pnpm audit --audit-level=high  # 依赖安全审计（可选，CI 必跑）
```

Git 侧纪律：husky + commitlint 强制**约定式提交**，lint-staged 在提交前自动跑 prettier/oxlint——提交被 hook 拦截时先看报错信息，不要 `--no-verify` 绕过。

## 7. 注意事项

- **affected 语义**：CI 只跑受影响项目；本地 `pnpm typecheck` 是全量，两者都过才稳；
- **产物确定性**：`generate-api` 必须在 typecheck/build 之前（CI 已保证，本地注意顺序）；
- **密钥**：所有 secrets 走 GitHub Settings，禁止写进 workflow 或镜像；
- 修改 workflow 后：push 触发对应 workflow 验证，或用 `workflow_dispatch` 手动触发（docs/deploy 支持）。
