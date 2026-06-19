# MonoKit — 开源企业级全栈基座

> **不重复造轮子，只造一次底座。** 认证、鉴权、RBAC、CSRF、限流、缓存、审计、文件上传一次写齐，你只管写业务。MIT 开源，fork 即用。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522%20LTS-339933)](./package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220)](./package.json)
[![架构图](https://img.shields.io/badge/架构图-查看-blue)](./docs/ARCHITECTURE.md)

---

## 这是什么

**MonoKit 是一个开源的企业级全栈基座项目**（Starter Foundation），不是业务产品。

你拿到的不是"一个能跑的 App"，而是"一个新项目所需的全部底座代码"：

- **后端**：`apps/server` — NestJS 11 统一 API，GraphQL + REST 双协议
- **管理后台**：`apps/admin` — Vue 3 + Naive UI + Tailwind CSS
- **C 端**：`apps/web` — Vue 3 + Naive UI + Tailwind CSS
- **共享**：`packages/*` — Zod schema、ESLint/TS 配置、Git hooks

> 思路：**不重复造轮子，只造一次底座。** 新建项目时，fork 这一个仓库，删掉业务代码，保留基础设施，开始写你的业务。

---

## 核心思想

### 1. 开源基座，不是产品

MonoKit 的目标不是成为某一个 SaaS，而是成为**所有 NestJS + Vue 3 中后台项目的底座**。

- ✅ 你 fork 它，改 package 名为你的项目，删掉不需要的页面
- ✅ 你不需要感谢我们，不需要保留品牌，不需要回 PR
- ✅ 这就是开源基座应该有的样子：**把重复的基础设施写一次，剩下是你的**

### 2. 0 → 1 绿色项目

没有历史包袱。所有技术选型都追求"当前最新"而非"历史兼容"。

> **尝鲜优先**（Latest-First）：引入任何 npm 包之前，先看它的最新稳定版和当前推荐 API。

### 3. 通用性 > 业务特化

代码追求**通用性、可复用性、文档完备性**——写的时候想清楚别人怎么用。

### 4. 文档驱动

不是"先写代码再补文档"，而是"先想清楚写文档再写代码"。

---

## 核心特性

| 类别     | 选型              | 说明                                    |
| -------- | ----------------- | --------------------------------------- |
| 后端框架 | NestJS            | v11，模块化分层                          |
| ORM      | Prisma            | v7，UUID v7 主键                        |
| 验证     | Zod               | Schema 驱动，前后端共享                 |
| 限流     | @nestjs/throttler | v6，命名限流器，按 IP / 用户 / 路由配置 |
| 日志     | nestjs-pino       | 结构化日志，按请求 ID 串联              |
| 缓存     | ioredis           | Redis 优先，无 Redis 时自动降级内存缓存 |
| 测试     | Vitest            | v4，后端默认测试框架                    |
| 前端框架 | Vue 3             | Composition API + `<script setup>`      |
| UI 库    | Naive UI          | 复杂组件（DataTable / Form / Modal）    |
| 样式     | Tailwind CSS      | 优先 utility classes                    |
| API 协议 | GraphQL + REST    | GraphQL 为主，REST 用于认证 / 上传      |

---

## 文案规范

- **唯一目标语言**：简体中文
- **不做国际化**（详见 [CLAUDE.md](./CLAUDE.md)）：所有用户可见文案一律直接硬编码中文
- 不引入 `vue-i18n` / `i18next` / 任何多语言库

---

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动 PostgreSQL（需要 Docker，或本机已装 PostgreSQL）
docker compose up -d postgres

# 3. 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 .env，确保 DATABASE_URL 指向你的数据库

# 4. 初始化数据库
cd apps/server && pnpm db:generate && pnpm db:migrate && pnpm db:seed && cd ../..

# 5. 启动（后端 + admin + web）
pnpm dev
```

访问入口：

- 管理后台：<http://localhost:5173>（默认账号 `root` / `Root!123`）
- C 端：<http://localhost:5174>
- API：<http://localhost:3000>
- GraphQL Playground：<http://localhost:3000/graphql>

---

## 如何 fork 并定制

```bash
# 1. clone
git clone https://github.com/laozhengfanle/monorepo-starter.git my-project
cd my-project

# 2. 改包名
# 把 root package.json、apps/*/package.json、packages/*/package.json 里的
# "name" 字段全部改成 "@my-org/my-project-*"

# 3. 删掉不需要的页面
# 比如只做管理后台：
rm -rf apps/web

# 4. 安装 + 启动（同上 "快速开始" 步骤）

# 5. 开始写业务
# 删掉 apps/admin/src/features/iam/ 等示例模块
# 保留认证、安全、缓存、日志这些基础设施
```

**记住：MonoKit 是你的脚手架，不是你的产品。** 把它当一次性用品——用完即扔，保留架构，删掉业务。

---

## 功能矩阵

### 管理后台（apps/admin）

- **仪表盘**：系统概览
- **权限控制**：管理员管理、角色管理、菜单管理
- **配置中心**：后台设置、审计日志、短信 / 邮件 / 文件存储、OAuth 配置、Turnstile 人机验证、缓存管理
- **内置文档**：消费者文档 + 内部设计文档

### C 端（apps/web）

- **首页**：产品展示
- **会员内容**：普通会员 / VIP / SVIP 三级内容
- **个人中心**：资料管理、安全设置
- **登录方式**：短信验证码、账号密码、Turnstile 防护

---

## 目录结构

```
monokit/
├── apps/
│   ├── server/      NestJS 统一 API（GraphQL + REST）
│   ├── admin/       管理后台 Vue 3 SPA
│   └── web/         C 端 Vue 3 前端
├── packages/
│   ├── shared/      共享 Zod schema 与工具函数
│   └── config/      共享 ESLint / TS 配置
└── docs/
    ├── 用户指南/    消费者文档（fork 后阅读，共 9 篇）
    └── 开发文档/    内部设计文档（设计决策、技术选型，共 32 篇）
```

---

## 文档导航

### 用户指南（`docs/用户指南/`，fork 后阅读）

- [README.md](./docs/用户指南/README.md) — 文档入口与索引
- [01-快速上手.md](./docs/用户指南/01-快速上手.md) — 15 分钟跑通项目
- [02-架构总览.md](./docs/用户指南/02-架构总览.md) — 顶层目录、模块切分、调用关系
- [03-模块参考.md](./docs/用户指南/03-模块参考.md) — 基座模块的职责与 API
- [04-配置参考.md](./docs/用户指南/04-配置参考.md) — 全部环境变量 + system_config 表
- [05-扩展指南.md](./docs/用户指南/05-扩展指南.md) — 加业务模块、改库、加权限、升级基座
- [06-部署运维.md](./docs/用户指南/06-部署运维.md) — 构建、镜像、生产编排、备份
- [07-故障排查.md](./docs/用户指南/07-故障排查.md) — 常见症状 → 原因 → 解法
- [08-Changelog.md](./docs/用户指南/08-Changelog.md) — 版本基线 + 升级指南

### 内部开发文档（`docs/开发文档/`，设计与决策依据）

- [项目总览.md](./docs/开发文档/项目总览.md) — 基座定位与设计原则
- [技术架构.md](./docs/开发文档/技术架构.md) — 各端技术栈与分层
- [权限控制.md](./docs/开发文档/权限控制.md) — RBAC 与缓存设计
- [安全防护.md](./docs/开发文档/安全防护.md) — CSRF / XSS / 限流 / Helmet
- [缓存设计.md](./docs/开发文档/缓存设计.md) — 两级缓存与失效策略
- [API设计规范.md](./docs/开发文档/API设计规范.md) — GraphQL + REST 双协议
- [前端开发规范.md](./docs/开发文档/前端开发规范.md) — Vue 3 + Naive UI + Tailwind
- [测试策略.md](./docs/开发文档/测试策略.md) — 单元 / e2e / 覆盖率
- [部署运维.md](./docs/开发文档/部署运维.md) — Docker / Nginx / 监控
- [部署-K8s.md](./docs/开发文档/部署-K8s.md) — K8s manifest 部署指南
- 完整列表见 `docs/开发文档/` 目录（共 32 篇）
- [GraphQL Schema 流程](./apps/server/docs/GraphQL.md)

---

## 演进

MonoKit 遵循"基础设施先到位，业务后展开"原则：

- 认证 · 鉴权 · RBAC · 安全防护 · 错误码 · 日志 · 限流 · 缓存 · 文件上传 — 已落地
- MIT 开源治理（LICENSE / Issue 模板 / README）

---

## 许可证

[MIT](./LICENSE) © 2026 MonoKit Contributors

本项目以 MIT 协议开源，可自由用于商业项目、修改源码、闭源分发。
