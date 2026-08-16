---
name: antd
description: "Use when the user's task involves Ant Design (antd) — writing antd components, debugging antd issues, querying antd APIs/props/tokens/demos, migrating between antd versions, or analyzing antd usage in a project. Triggers on antd-related code, imports from 'antd', or explicit antd questions. Follows the official antd AI docs: for-agents / cli / mcp / design-md / llms."
---

# Ant Design（antd）开发指南

本 skill 整合 antd 官方为 AI 提供的 5 篇文章要求：
[for-agents](https://ant.design/docs/react/for-agents-cn) · [cli](https://ant.design/docs/react/cli-cn) · [mcp](https://ant.design/docs/react/mcp-cn) · [design-md](https://ant.design/docs/react/design-md-cn) · [llms](https://ant.design/docs/react/llms-cn)

## 核心铁律：写代码前先查文档，不要依赖记忆

> 本项目使用 antd v6（可能包含破坏性变更）。组件 API、约定和文件结构与训练数据中可能不同。**在写任何 antd 代码之前**，先查阅官方文档，注意弃用警告，并遵循以下流程使用 Ant Design。

项目已安装 `@ant-design/cli`（离线元数据，覆盖 v3/v4/v5/v6）。**写组件代码前必须先查 API，不要凭记忆写。**

## CLI 工作流（写代码前必做）

```bash
# 1. 查组件 API：props、类型、默认值（结构化输出）
antd info Button --format json

# 2. 拿一个可运行的 demo 作为起点
antd demo Button basic --format json

# 3. 查语义化 classNames/styles（自定义样式时）
antd semantic Table --format json

# 4. 查组件级 design token（主题定制时）
antd token Button --format json

# 5. 查完整文档（需要详尽说明时，可加 --lang zh 取中文）
antd doc Table --format json
```

**流程：** `antd info` → 理解 props → `antd demo` → 拿到可用示例 → 再写代码。

## 调试 / 诊断

```bash
# 环境快照（系统、依赖、浏览器、构建工具）
antd env --format json

# 诊断项目级配置问题
antd doctor --format json

# 校验某个 prop 在用户的具体版本是否存在
antd info Select --version 5.12.0 --format json

# 检查弃用 / 错误用法
antd lint ./src --format json
```

**流程：** `antd env` → 环境快照 → `antd doctor` → 配置检查 → `antd info --version X` → 按实际版本核对 API → `antd lint` → 找出弃用或不正确用法。

## 版本迁移（antd v4/v5/v6）

```bash
# 完整迁移清单
antd migrate 4 5 --format json

# 某组件迁移检查
antd migrate 4 5 --component Select --format json

# 生成 agent 友好的自动迁移提示（不修改文件）
antd migrate 4 5 --apply ./src --format json

# 看两个版本间的变更
antd changelog 5.21.0..5.24.0 --format json
```

**流程：** `antd migrate` → 完整清单 → `antd changelog <v1> <v2>` → 理解破坏性变更 → 应用修复 → `antd lint` → 验证无弃用用法残留。

## 分析项目 antd 使用情况

```bash
antd usage ./src --format json          # 组件使用统计
antd usage ./src --filter Form --format json  # 只看某组件
antd lint ./src --only deprecated --format json  # 只看弃用类
antd lint ./src --only a11y --format json       # 只看无障碍类
antd list --format json                 # 列出全部组件
```

## 已知 antd v6 破坏性变更（本项目实测踩坑）

- `message` / `notification` / `Modal` 静态方法无法消费动态主题上下文：**必须用 `App.useApp()`** 获取实例，禁止 `import { message } from 'antd'` 直接调用
- `Space`：`direction` → **`orientation`**
- `Alert` / `Notification`：`message` 属性 → **`title`**
- `Drawer`：`width` → **`size`**；`destroyOnClose` → **`destroyOnHidden`**
- `Button`：用 `color` / `variant` API（如 `color="red" variant="outlined"`），替代旧 `type="danger"` / ghost
- 2 个中文字符的按钮文本会自动插入空格（"确定" → "确 定"），选择器注意

## 设计语言（design.md）

主题 token、色彩、间距、圆角等视觉语言见 `https://ant.design/design.md`。需要设计 token 值时用 `antd token <组件> --format json` 或 `antd design.md --format json` 获取。

## 结构化文档（llms.txt）

需要把完整组件文档喂给上下文时，可用：
- `https://ant.design/llms-full-cn.txt` — 全量组件文档（中文）
- `https://ant.design/components/<组件名>.md` — 单组件文档
- `https://ant.design/design.md` — 设计语言

## MCP / IDE 集成（参考）

antd CLI 可作为 MCP Server（8 tools + 2 prompts）接入 Claude Code / Cursor / VS Code：
```json
{
  "mcpServers": {
    "antd": {
      "command": "npx",
      "args": ["-y", "@ant-design/cli", "mcp"]
    }
  }
}
```
（如当前工具未配置此 MCP，用上方 CLI 命令等效替代。）
