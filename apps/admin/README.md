# Naive Admin

基于 Vue 3 + TypeScript + Naive UI 的企业级后台管理模板。

## 技术栈

- **Vue 3** — Composition API + `<script setup>`
- **TypeScript 6** — 全量类型覆盖
- **Naive UI** — 组件库
- **Vue Router 5** — 动态路由 + 权限守卫
- **Pinia 3** — 状态管理
- **Tailwind CSS 4** — 原子化样式
- **Vite 8** — 构建工具

## 快速开始

```bash
# 安装依赖（需要 Node.js >= 22）
pnpm install

# 复制环境变量模板
cp .env.example .env

# 启动开发服务器
pnpm dev
```

访问 http://localhost:5173，使用 `root / Root!123` 登录（与后端 `seed.ts` 超管账号一致）。

## 环境变量

| 变量                      | 说明                            | 必填                     |
| ------------------------- | ------------------------------- | ------------------------ |
| `VITE_APP_TITLE`          | 应用标题                        | 是                       |
| `VITE_API_BASE_URL`       | RESTful 接口前缀（默认 `/api`） | 否                       |
| `VITE_GRAPHQL_ENDPOINT`   | GraphQL 端点（默认 `/graphql`） | 否                       |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile 站点密钥   | 否（未配置则跳过验证码） |

## 目录结构

```
src/
├── api/            # API 层（GraphQL 客户端 + RESTful 请求）
├── app/            # 应用级模块（布局、路由、Store）
│   ├── layouts/    # 主布局/游客布局
│   ├── router/     # 路由配置 + 守卫 + 动态路由转换
│   ├── store/      # Pinia Store（用户、权限、设置、标签页）
│   └── components/ # 全局组件（Settings 抽屉、RouterView）
├── features/       # 业务页面（dashboard、iam、login、system）
├── shared/         # 共享工具（composables、directives、utils）
└── main.ts         # 入口
```

## API 接口策略

> **默认走 GraphQL，RESTful 仅用于特殊场景。**

所有查询（Query）和写操作（Mutation）统一走 GraphQL（端点 `/graphql`），仅以下场景使用 RESTful：

| 方法 | 路径                    | 说明       | 原因                                       |
| ---- | ----------------------- | ---------- | ------------------------------------------ |
| POST | `/api/admin/auth/login` | 管理端登录 | 涉及 HttpOnly Cookie / Set-Cookie 安全机制 |
| POST | `/api/auth/refresh`     | 刷新 Token | 需要读写 Cookie，RESTful 更易控制          |
| POST | `/api/auth/logout`      | 登出       | 需要清除 Cookie，独立端点便于限流和审计    |

### 新增接口规则

1. **查询数据** → GraphQL Query
2. **写入数据** → GraphQL Mutation
3. **涉及 Cookie / 文件上传下载 / 特殊安全机制** → RESTful
4. 所有 GraphQL 操作统一通过 `src/api/graphql-client.ts` 的 `gqlQuery` 发送

## 构建

```bash
pnpm build    # 类型检查 + 构建
pnpm preview  # 预览构建产物
```

## 新增页面

在 `src/features/` 下新建 `.vue` 文件，然后在 `src/app/router/menu-to-routes.ts` 的 `componentMap` 中注册即可。
