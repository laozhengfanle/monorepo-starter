## 关联 Issue

- Closes #（关联的 issue 编号）
- Related to #（相关但非关闭的 issue）

## 变更说明

简要描述这次 PR 做了什么、为什么做。

## 变更类型

- [ ] feature（新功能）
- [ ] fix（Bug 修复）
- [ ] refactor（重构）
- [ ] docs（仅文档）
- [ ] test（仅测试）
- [ ] chore（构建/工具链）
- [ ] perf（性能优化）

涉及到的子项目：

- [ ] `apps/server`
- [ ] `apps/admin`
- [ ] `apps/web`
- [ ] `packages/shared`
- [ ] `packages/config`
- [ ] `packages/hooks`
- [ ] `docs/`
- [ ] 仓库根

## 测试情况

描述这次改动如何被测试覆盖：

- 单元测试：
- e2e 测试：
- 手工验证步骤：

## 截图 / 录屏

如有 UI 变更，请附上截图或录屏（拖拽到下方即可上传）。

## 文档更新

- [ ] 已更新 `docs/` 下相关设计文档
- [ ] 已更新 `README.md`
- [ ] 已更新 `.env.example`
- [ ] 无需文档更新

## Checklist

提交前请确认：

- [ ] 代码遵循项目代码规范（命名 / Vue / NestJS / Zod）
- [ ] 已运行 `pnpm -F <app> lint` 并通过
- [ ] 已运行 `pnpm -F <app> test` 并通过
- [ ] 已运行 `pnpm -F <app> build` 并通过
- [ ] 已运行 `pnpm -F <apps/server> test:e2e`（如影响后端）
- [ ] 公共 API 变更已同步更新 schema / 类型定义
- [ ] 数据库 schema 变更已生成迁移
- [ ] 未提交 `.env`、密钥、临时文件
- [ ] commit 信息遵循 Conventional Commits
- [ ] 已在本地 rebase 过最新 main

## 备注

其他需要 reviewer 关注的信息。
