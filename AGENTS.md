<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# 提交纪律（最高优先级，必须遵守）

> ⚠️ 违反以下规则视为严重事故。本规则对仓库内所有 AI 协作代理（Claude / Cursor / Codex / Gemini / OpenCode 等）一视同仁。

1. **未经用户明确允许，禁止 `git commit` / `git push` / `git tag` / `git reset` / `git rebase` 等任何写操作**。用户没有说"提交 / commit / 保存到 git"，就不许动 git。
2. **`git add -A` / `git add .` 同样禁止**——除非用户明确要求暂存。工作区可能混有用户未完成或不想提交的改动，全量暂存会把无关改动卷入提交。
3. 只允许 `git status` / `git diff` / `git log` 等**只读**命令用于了解现状。
4. 需要提交时：先列出要提交的文件清单 + 拟定 commit message，**等用户确认**后再执行。
5. 用户说"先 commit 一个版本"或明确提到提交时，视为允许，但仍需先展示提交内容概览。
6. 意外把无关改动带入提交后，应立即如实告知用户，并给出回退方案，不得隐瞒。

<!-- nx configuration end-->

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

<!-- frontend conventions start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# 前端页面规范（列表页搜索栏等）

> 本仓库高频复用列表页 + 搜索栏。任何 AI / 开发者在新建或修改列表页时，必须遵守以下规范，不得另起炉灶复制粘贴旧写法。违反视为代码评审不通过。

## 一、列表页搜索栏规范

### 1. 位置

- **搜索栏必须位于列表/表格正上方的独立 Card 内**（账户管理页写法为正确示范）：
  ```tsx
  <SearchBar fields={searchFields} onSearch={handleSearch} onReset={handleReset} />
  <Card title="列表" ...>{/* Table */}</Card>
  ```
- **禁止**把筛选表单嵌在表格 Card 内部（title 下方）——审计日志页旧写法是错误示范。
- **禁止手写散装搜索表单**（Form/Input/Select 拼装），一律用共享 `SearchBar`；两 Card 间距 `marginBottom: 16` 由组件内置。

### 2. 字段宽度

- **页面层禁止**手动设置 `style={{ width }}`（当前 160/180/200/260/280 全删掉）。
- 控件宽度由共享 `SearchBar` 统一管理：**Row/Col 栅格布局**，各控件 `width: 100%` 填满栅格列，Input/Select/DatePicker 天然等宽且响应式换行（`xs=24 / sm=12 / xl=6`，dateRange 默认 `xl=8`，可传 `span` 覆盖）；**标签统一 72px 对齐**；**按钮区为栅格流内最后一个**、空 label 与 input 对齐；checkbox 类字段（如「显示已删除」）为独立栅格项（空 label 对齐）。
- 为什么必须给宽度：antd Select **没有默认宽度**（官方文档示例均显式设置 `width`），不设会收缩到最小宽度、选中值被截断成省略号（实测踩坑）。

### 3. 字段配置（页面只声明，渲染归 SearchBar）

- 页面通过 `fields: SearchField[]` 配置数组声明字段，**不手写 Form.Item / Input / Select**。
- 输入类：`allowClear` + `placeholder` + `autoComplete="off"`；搜索语义（用户名/关键词）加 `prefix={<SearchOutlined />}`。
- 选择类（Select / DatePicker）：`allowClear` + `placeholder="全部"`，不加 prefix。
- checkbox 类：`label` 传 `''`，勾选文案用 `checkLabel`（如「显示已删除」）。
- 默认值用 `initialValue`。

### 4. 按钮（查询 / 重置统一）

- **查询与重置都禁止带 icon**（统一，不带 `icon={<SearchOutlined />}`）：
  ```tsx
  <Form.Item style={{ marginBottom: 0 }}>
    <Space size="small">
      <Button type="primary" htmlType="submit">
        查询
      </Button>
      <Button onClick={handleReset}>重置</Button>
    </Space>
  </Form.Item>
  ```

### 5. 重置语义（统一）

- 重置 = `searchForm.resetFields()` + 清空查询状态 + `setPage(1)` + **重新触发查询**。
- 禁止 `setKeyword('')` / `setFieldValue('pattern','*')` 之类的散装重置。

### 6. 查询触发

- 点击「查询」才发请求（不自动），`onFinish` 里统一 `setPage(1)` + 更新筛选状态。

## 二、落地要求

- 新建列表页一律使用共享 `SearchBar` 组件（`packages/shared/ui`），通过字段配置数组声明，禁止手写散装 Form。
- 现有页面（admin-accounts / admin-roles / audit-logs / cache-admin）后续统一迁移到 SearchBar；admin-menus 为树形表格，可不用搜索栏。
- 详细设计见 [docs/02-开发规范/列表页规范.md](docs/02-开发规范/列表页规范.md)。

<!-- frontend conventions end-->

<!-- db configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# 数据库 & Seed 规范

- **Schema 变更流程**：改 `apps/server/prisma/schema.prisma` 后运行 `pnpm db:migrate`（开发环境生成迁移，**迁移文件随代码提交**）；生产/CI 用 `pnpm db:deploy` 只应用迁移。
- **Seed 文件结构（硬性要求，禁止违反）**：种子数据按「数据域」拆分在 `apps/server/prisma/seed/` 目录，**禁止**往 `seed.ts` 主体塞数据：
  - 每个数据域一个文件，导出一个**幂等**的 `seedXxx(db)` 函数（upsert / 查重，重复执行安全）；
  - `seed.ts` 只做编排：生产守卫（`NODE_ENV=production` 拒绝执行）+ 数据库连接 + 按依赖顺序调用（角色 → 菜单 → 账户 → 字典 → 配置 → 演示 → 清理）；
  - **主数据 vs 演示数据分层**：核心主数据任何环境都要；演示数据集中在 `demo.ts`（仅非生产，由入口判断；生产裁剪删调用即可）；
  - 新增种子数据 = 按域新建/追加 `seed/xxx.ts` 并在 `seed.ts` 依赖顺序中登记，然后本地跑 `pnpm db:seed` 验证幂等（连跑两遍不报错、不重复造数）。
- **哪些数据进 seed**：参照/主数据（角色、菜单+权限点、初始账户、字典、系统配置）一律进 seed；纯运行数据（审计日志、token 撤销、上传文件）不进 seed；账户特例授权属运行数据，仅演示实例放 `demo.ts`。
- 详细设计见 [docs/02-开发规范/数据库设计.md](docs/02-开发规范/数据库设计.md)。

<!-- db configuration end-->

<!-- account terminology start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# 账户术语铁律（禁止 user）

> 违反视为代码评审不通过。fork 扩展任何「人」相关功能（会员/代理商/员工/新后台角色）前，先读 [docs/02-开发规范/用户体系与命名规范.md](docs/02-开发规范/用户体系与命名规范.md)。

1. **禁止使用 `user` 指代某类用户**（代码、数据库、接口、注释、commit message 一律禁止）。术语表：`account`（身份容器）、`identity`（登录标识）、`member`（C 端会员）、`admin`（后台管理员）、`agent`（代理商）、`staff`（员工）、`profile`（各端档案）。
2. **唯一例外**：`User-Agent`/`userAgent`（HTTP 标准头）；以及确实代表"全部类型账户"的泛称场景——此时**优先用 `account*`**，不用 `user*`。
3. **体系原则**：`Account` 是唯一身份底座（凭证/令牌/锁定/审计全端复用）；各端（admin/member/agent/staff）通过 `Account.userType` 区分，各自独立档案表 + 模块，**互不侵入**。禁止为会员/代理改 `AdminProfile` 或复用管理端 RBAC。
4. **遗留 `User` 表是演示废弃**（与 Account 无关、业务零引用）：新代码禁止引用；商城等 fork 项目应废弃或迁移到 `Account(userType='member')` + `MemberProfile`。
5. **新端扩展范式**：新建 `XxxProfile` + `XxxModule` + `XxxAuthController`（复用 TokenIssuance/LoginLock/Audit）；公开端点（注册等）必须独立限流 + Turnstile + 验证码基线。

<!-- account terminology end-->

<!-- upstream feedback start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# 上游 Bug 反馈（fork 项目必读）

> 本项目由 **monorepo-starter**（https://github.com/laozhengfanle/monorepo-starter）fork/演进而来。
> fork 后开发中若发现 **starter 底座本身的问题**（非业务代码问题），请**主动向上游提交 Issue**，让上游与所有 fork 受益。详细指南见 [docs/04-工程与质量/上游反馈指南.md](docs/04-工程与质量/上游反馈指南.md)。

1. **判断是否上游问题**（满足其一即提）：
   - 问题出在 starter 的通用能力：认证/权限/RBAC、审计、限流、缓存、上传、配置、GraphQL/REST 基础设施、seed、文档规范、CI/部署模板；
   - 你**未改动**相关代码，按文档/示例操作仍不符合预期；
   - 文档与代码行为不一致。
   - 反之，问题出在你 fork 后新增的业务逻辑/字段/模块 → **不提上游**，自己修。
2. **提哪里**：上游仓库 `https://github.com/laozhengfanle/monorepo-starter`（Issues → New Issue → 「Bug 报告」模板）。
3. **如何提（按可用性选其一）**：
   - 有 `gh` CLI 且具备上游写权限：`gh issue create --repo laozhengfanle/monorepo-starter --title "[bug] <概述>" --body "<按模板字段>"`；
   - 无写权限（最常见）：生成**预填链接**交给用户点击提交——`https://github.com/laozhengfanle/monorepo-starter/issues/new?title=[bug]+<概述>&body=<模板字段，URL 编码>`；
   - 或写好 issue 草稿（Markdown，按模板字段），让用户粘贴提交。
4. **必填信息**（对照 Bug 模板）：上游版本（`apps/admin/src/app/version.ts` 的 `APP_VERSION`）、现象、复现步骤、期望/实际行为、环境（OS / Node / pnpm / 涉及模块）、**fork 后是否改动过相关代码**。
5. **禁止**：把业务敏感数据/密钥/内部地址放进 issue；未经用户确认不得发布含敏感信息的 issue。
6. 修复前可用本地 workaround 继续开发；issue 留作记录，修复可等上游或自行提 PR。

<!-- upstream feedback end-->
