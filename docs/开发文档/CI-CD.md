# CI/CD 流程

> 本文件说明 GitHub Actions workflows 的职责分工、触发条件、产物与本地复现命令。所有工作流集中在 `.github/workflows/` 目录。

## 工作流一览

| 工作流               | 文件          | 触发条件                                        | 主要职责                                                         | 耗时      |
| -------------------- | ------------- | ----------------------------------------------- | ---------------------------------------------------------------- | --------- |
| **CI**               | `ci.yml`      | push main / PR                                  | install → lint → typecheck → test → build → docker build → Trivy | 15-25 min |
| **Lint (fast-fail)** | `lint.yml`    | push main / PR（仅源码文件）                    | lint + typecheck + gitleaks                                      | 5-10 min  |
| **Deploy**           | `deploy.yml`  | push tag `v*.*.*` / 手动 dispatch               | 构建并推送 3 个镜像到 GHCR + SSH 部署                            | 20-30 min |
| **Release**          | `release.yml` | push tag `v*.*.*`                               | 构建镜像 + 生成 changelog + 发布 GitHub Release                  | 25-30 min |
| **Docs**             | `docs.yml`    | push main（apps/ 或 packages/） / 手动 dispatch | 生成 TypeDoc / OpenAPI / ER 图 + 部署 GitHub Pages               | 10-15 min |

## 1. CI 工作流（`ci.yml`）

### 触发条件

```yaml
on:
    push:
        branches: [main]
    pull_request:
        branches: [main]
```

### 矩阵与缓存

- **Node 版本**：当前 `22.x`（如需多版本验证可改 matrix 注释）
- **pnpm 版本**：`11`（从 `packageManager` 字段读取）
- **缓存路径**：`~/.local/share/pnpm/store`（与 `setup-node` 的 `cache: pnpm` 互补）

### Job 流程

```
lint-test-build (20 min)          build-and-scan (25 min)
    ├─ install                         ├─ docker buildx
    ├─ lint (pnpm -r lint)             ├─ build server image
    ├─ typecheck (pnpm -r typecheck)   ├─ build admin image
    ├─ test server                     ├─ build web image
    ├─ test admin                      ├─ trivy scan server
    ├─ test web                        ├─ trivy scan admin
    └─ build (pnpm -r build)           └─ trivy scan web
```

### 本地复现

```bash
# 完整复现
pnpm install --frozen-lockfile
pnpm -r lint
pnpm -r typecheck
pnpm -F @apps/server test -- --run
pnpm -F @apps/admin test -- --run
pnpm -F @apps/web test -- --run
pnpm -r build
```

## 2. Lint (fast-fail) 工作流（`lint.yml`）

> ⚠️ 与 `ci.yml` 重复：保留作为 fast-fail 触发器，仅在改动命中 lint/typecheck 路径时启动，节省 CI 资源。

### 触发条件

```yaml
on:
    push:
        branches: [main]
        paths:
            - '**/*.{ts,vue,js,mjs,cjs}'
            - '**/*.{json,md,yml,yaml}'
            - '**/.eslintrc*'
            - '**/eslint.config.*'
    pull_request:
        branches: [main]
```

### Jobs

- `lint` — `pnpm -r lint`
- `typecheck` — `pnpm -r typecheck`
- `security` — gitleaks secret scan（`fail-on-secret: true`）

## 3. Deploy 工作流（`deploy.yml`）

### 触发条件

```yaml
on:
    push:
        tags: ['v*.*.*'] # e.g. v1.0.0, v2.3.4
    workflow_dispatch:
        inputs:
            environment: [staging | production]
            image_tag: <可选手动指定 tag>
```

### 流程

```
build-and-push (30 min)             deploy (15 min)
    ├─ docker buildx                    ├─ SSH 到目标服务器
    ├─ login GHCR                       ├─ 备份上一个 tag
    ├─ extract metadata × 3             ├─ pull 新镜像
    ├─ build + push server image        ├─ docker compose up
    ├─ build + push admin image         ├─ 健康检查（失败自动回滚）
    └─ build + push web image           └─ 清理 dangling 镜像
```

### 必填 GitHub Secrets

| Secret 名称  | 含义                                           |
| ------------ | ---------------------------------------------- |
| `SSH_HOST`   | 目标服务器 IP / 域名                           |
| `SSH_USER`   | SSH 登录用户名（建议 `deploy`，不要用 `root`） |
| `SSH_KEY`    | SSH 私钥完整内容（含 `-----BEGIN/END-----`）   |
| `DEPLOY_URL` | 部署成功后的访问 URL                           |

> 详见 [部署运维.md#GitHub Secrets 配置](./部署运维.md#github-secrets-配置)

### 本地复现

```bash
# 1) 在本地打 tag
git tag v1.0.0
git push origin v1.0.0

# 2) GitHub Actions 自动构建并部署
# 3) 或者手动触发：Actions → Deploy → Run workflow → 选择 environment
```

## 4. Release 工作流（`release.yml`）

### 触发条件

```yaml
on:
    push:
        tags: ['v*.*.*'] # e.g. v1.0.0
```

### 流程

```
build-images (30 min)          generate-changelog (10 min)     publish-release (10 min)
    ├─ docker buildx                ├─ 提取 commit 历史             ├─ 下载 changelog
    ├─ login GHCR                   ├─ 按 conventional commits 分类 ├─ 创建 GitHub Release
    ├─ build + push server          └─ 输出 markdown               └─ attach changelog
    ├─ build + push admin
    └─ build + push web
```

### 镜像 tag 策略

- **主 tag**：`v1.0.0`（与 git tag 一致）
- **辅 tag**：`short-sha`（如 `a1b2c3d`）
- **latest**：仅默认分支（`main`）推 `latest`

### Conventional Commits 自动分类

Release changelog 自动按 commit 类型分类：

- `feat:` → ✨ Features
- `fix:` → 🐛 Bug Fixes
- `perf:` → ⚡ Performance
- `refactor:` → ♻️ Refactoring
- `docs:` → 📚 Documentation
- `chore:` → 🔧 Chores

> 标签 `ignore-for-release` 会被自动忽略。

## 5. Docs 工作流（`docs.yml`）

### 触发条件

```yaml
on:
    push:
        branches: [main]
        paths:
            - 'apps/server/**'
            - 'apps/admin/**'
            - 'apps/web/**'
            - 'packages/shared/**'
            - 'apps/server/prisma/**'
            - '.github/workflows/docs.yml'
    workflow_dispatch:
```

### 流程

```
build-docs (20 min)             deploy (10 min)
    ├─ install                       └─ 部署到 GitHub Pages
    ├─ TypeDoc (共享包 API)
    ├─ OpenAPI (REST API)
    ├─ ER Diagram (Mermaid)
    ├─ 复制 docs/ 设计文档
    ├─ 生成 index.html
    └─ upload-pages-artifact
```

### 部署要求

- 仓库 Settings → Pages → Source: **GitHub Actions**
- 站点地址：`https://<owner>.github.io/<repo>/`
- 环境 `github-pages` 需要在 Settings → Environments 中创建

### 文档清单

| 路径               | 内容                              |
| ------------------ | --------------------------------- |
| `/api/index.html`  | TypeDoc 生成的 shared 包 API 文档 |
| `/openapi.json`    | 服务端 REST API OpenAPI 3.0 规范  |
| `/er/schema.mmd`   | Prisma schema 的 Mermaid ER 图    |
| `/markdown/*.html` | 仓库 `docs/` 下的中文设计文档副本 |
| `/index.html`      | 文档首页导航                      |

## 6. 并发控制

所有工作流都设置了 `concurrency`：

- **CI / Docs**：`cancel-in-progress: true`（同 branch 取消旧 run，节省资源）
- **Deploy / Release**：`cancel-in-progress: false`（同 tag 不允许多个 deploy 并行）

## 7. 权限最小化原则

每个工作流都显式声明 `permissions`：

| 工作流        | 权限                                                                  |
| ------------- | --------------------------------------------------------------------- |
| `ci.yml`      | `contents: read` + `security-events: write`（仅 build-and-scan 需要） |
| `lint.yml`    | `contents: read`                                                      |
| `deploy.yml`  | `contents: read` + `packages: write`                                  |
| `release.yml` | `contents: write` + `packages: write`                                 |
| `docs.yml`    | `contents: read` + `pages: write` + `id-token: write`                 |

## 8. 本地工具一致性

CI 端使用的工具版本应与本地一致：

| 工具     | 本地                    | CI                            |
| -------- | ----------------------- | ----------------------------- |
| Node.js  | ≥ 22 LTS                | `22.x`                        |
| pnpm     | 11                      | `11`                          |
| Gitleaks | `brew install gitleaks` | `gitleaks/gitleaks-action@v2` |

> 详见根目录 `package.json` 的 `packageManager` 字段。

## 9. 故障排查

### CI 失败：pnpm install

```bash
# 本地复现
rm -rf node_modules
pnpm install --frozen-lockfile

# 如果 lockfile 过期
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: update lockfile"
```

### CI 失败：lint

```bash
# 本地复现
pnpm -r lint

# 自动修复
pnpm -r lint:fix  # 如果有
# 或者
pnpm -r exec eslint . --fix
```

### CI 失败：typecheck

```bash
# 本地复现
pnpm -r typecheck
```

### CI 失败：test

```bash
# 本地复现
pnpm -F @apps/server test -- --run
pnpm -F @apps/admin test -- --run
pnpm -F @apps/web test -- --run
```

### CI 失败：docker build

```bash
# 本地复现
docker build -f apps/server/Dockerfile -t test:server .
docker build -f apps/admin/Dockerfile -t test:admin .
docker build -f apps/web/Dockerfile -t test:web .
```

### Gitleaks 误报

```bash
# 跳过本地检测
git commit --no-verify

# 调整规则（项目根目录）
# 编辑 .gitleaks.toml（如不存在需新建）
```

## 10. 延伸阅读

- [部署运维.md](./部署运维.md) — Docker / docker-compose / K8s / 宝塔部署
- [安全防护.md](./安全防护.md) — gitleaks / Trivy / 镜像扫描
- [测试策略.md](./测试策略.md) — Vitest / Playwright / 覆盖率
