<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

<!-- antd configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# Ant Design（antd）编码规则

本项目使用 antd v6（可能包含破坏性变更）。组件 API、约定和文件结构与训练数据中可能不同。**在写任何 antd 代码之前**，先查阅官方文档与 CLI，注意弃用警告，不要凭记忆写。

官方 AI 文档（5 篇，务必遵守）：
- for-agents: https://ant.design/docs/react/for-agents-cn
- cli: https://ant.design/docs/react/cli-cn
- mcp: https://ant.design/docs/react/mcp-cn
- design-md: https://ant.design/docs/react/design-md-cn
- llms: https://ant.design/docs/react/llms-cn

涉及 antd 任务时，先调用 `antd` skill（.agents/skills/antd/SKILL.md）。

## 写代码前必做（CLI 查询）

项目已安装 `@ant-design/cli`。写组件代码前：

```bash
antd info <组件> --format json          # 查 API：props/类型/默认值
antd demo <组件> <demo名> --format json  # 拿可运行示例
antd semantic <组件> --format json      # 语义化 classNames/styles
antd token <组件> --format json         # 组件级 design token
antd doc <组件> --format json           # 完整文档（可加 --lang zh）
```

调试/诊断：`antd env` → `antd doctor` → `antd info --version X` → `antd lint ./src`。

## 已知 antd v6 破坏性变更（本项目实测踩坑）

- `message` / `notification` / `Modal` 静态方法无法消费动态主题上下文：**必须用 `App.useApp()`** 获取实例，禁止 `import { message } from 'antd'` 直接调用
- `Space`：`direction` → **`orientation`**
- `Alert` / `Notification`：`message` 属性 → **`title`**
- `Drawer`：`width` → **`size`**；`destroyOnClose` → **`destroyOnHidden`**
- `Button`：用 `color` / `variant` API（如 `color="red" variant="outlined"`），替代旧 `type="danger"` / ghost
- 2 个中文字符的按钮文本会自动插入空格（"确定" → "确 定"），测试选择器注意

<!-- antd configuration end-->
