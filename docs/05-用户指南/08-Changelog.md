# 08 Changelog

> 版本历史记录。**当前版本：v0.1.25**。
> 版本单一来源为 `apps/admin/src/app/version.ts`，用 `pnpm bump [major|minor|patch]` 维护，**不要手改**。

---

## 1. 版本管理规则（先读）

- **单一事实源**：`apps/admin/src/app/version.ts` 的 `APP_VERSION`（顶栏/页脚显示 `vX.Y.Z`）；
- **提交时机**：每次向仓库提交功能改动前运行一次；
- **命令**：
  ```bash
  pnpm bump              # patch：0.1.25 → 0.1.26
  pnpm bump minor        # → 0.2.0
  pnpm bump major        # → 1.0.0
  ```
- **脚本行为**（`scripts/bump-version.mjs`）：读 version.ts → semver 递增 → 同步写回 version.ts 与根 package.json → 提交 `chore(release): vX.Y.Z` → 打注释标签 `vX.Y.Z`；
- **注意**：bump 只提交版本相关文件；你的功能改动需要**先自行提交**，不要混在 release 提交里。

---

## 2. Changelog 模板

每个版本按 commitlint 约定式提交（feat/fix/docs/refactor/perf/ci/build/chore）归类整理：

```markdown
## vX.Y.Z（YYYY-MM-DD）

### ✨ 新功能（feat）

- ...

### 🐛 修复（fix）

- ...

### 📝 文档 / 重构（docs / refactor）

- ...

### ⚙️ 构建 / CI / 工程（build / ci / chore）

- ...

### ⚠️ 破坏性变更（如有）

- ...
```

写条目时尽量带可检索的关键词（模块名、页面路径、命令），例如 `feat(server): auth 登录锁定支持后台配置`。

---

## 3. v0.1.25 近期变更摘要

> 基于 `git log` 最近若干提交整理，按主题归类。

### ✨ 新功能

- **仪表盘真实数据**：统计卡片、敏感操作趋势（周/月/年）、操作类型分布、最近操作记录全部接入真实数据（`dashboard` 模块，分析区块复用 `config:audit:view` 权限）—— `feat(dashboard)`；
- **富文本编辑器**：管理端引入富文本能力（Tiptap 相关扩展：image / link / table / placeholder / text-align / underline）—— `feat(dashboard)`；
- **后端基础设施增强**（`feat(server)`，commit 0df4f39）：
  - 业务指标收集器（登录失败 / 限流 / 审计 / 上传 / 缓存命中率，Prometheus `/metrics`）；
  - 定时任务（每日清理过期审计日志与 token 撤销记录，`@nestjs/schedule`）；
  - DataLoader（每请求独立实例，修复菜单树 / 角色码 N+1 查询）；
  - 通知抽象（短信 / 邮件可插拔 Provider，默认 mock）。

### ⚙️ 部署与 CI/CD

- **Docker / Compose / K8s 部署资产**（`build(deploy)`，commit f8f98cb）：server / admin 多阶段 Dockerfile（非 root + dumb-init）、开发编排（postgres/redis/server/admin/adminer）、生产编排（资源限制 + 安全基线 + 强密码校验）、k8s manifests（namespace / postgres+redis statefulset / server+admin deployment / ingress / kustomization）、健康探针（liveness + readiness）；
- **CI/CD 全链路**（`ci`，commit 17f0ffa）：审计 + Trivy 镜像扫描 + 镜像构建推送 + Release + Deploy + Docs 流水线；
- **Git 提交规范**（`build(git)`，commit e8d1745）：husky + commitlint（约定式提交）+ lint-staged。

### 📝 其它

- 文档修正与补充（含本用户指南）。

---

## 4. 历史版本（占位模板）

> 新版本发布时，把上一节内容下移到这里归档，并新建最新版本小节。

### v0.1.24

- feat: 可插拔存储驱动 + 文件管理 + 登录页品牌 + 审计词表单一事实源

### v0.1.23

- feat: 全面审计修复 + antd AI 规则（BFF 契约 / 权限 / 审计 / 软删规范化）

### v0.1.22

- refactor(arch): 对齐 BFF 架构规范 —— GraphQL 数据网关，REST 仅保留必须场景

### v0.1.21

- feat(system): 字典管理 + header 移除版本号

### v0.1.20

- feat(system): 系统设置 5 个页面（后台设置 / 审计日志 / 文件存储 / 缓存管理 / Turnstile）

### v0.1.16 – v0.1.19（要点）

- IAM 整改：软删除按老项目 Vue 方式（列表集成 + 独立权限 + 回收站 + 恢复/彻底删除）
- 全局权限隐藏目录承载 `global:trash:*`
- 彻底清除回收站菜单残留、修复菜单树叶子行误显展开符

---

## 5. 发布流程清单

1. 功能改动已提交（`git log` 干净）；
2. 全量门禁通过：`pnpm lint && pnpm lint:boundaries && pnpm typecheck && pnpm test && pnpm build`；
3. 更新本文件：把上节内容下移归档，写最新版本小节；
4. `pnpm bump`（自动提交 `chore(release): vX.Y.Z` 并打标签）；
5. `git push --tags`；
6. CI 流水线据此出 Release（审计 + Trivy + 镜像 + 部署，见 v0.1.25 的 CI/CD 全链路）。

---

返回：[README.md](./README.md)
