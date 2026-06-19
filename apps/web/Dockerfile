# apps/web/Dockerfile — C 端（会员端）Vue 3 SPA 多阶段构建
#
# 与 apps/admin/Dockerfile 共享完全相同的模板结构（multi-stage: node:22-alpine → nginx:1.27-alpine），
# 仅把 admin 工作区切到 web。两边结构一致便于维护。
#
# 镜像结构：
#   Stage 1 (builder) — node:22-alpine，安装依赖 + 执行 vite build，生成 dist/
#   Stage 2 (runtime) — nginx:1.27-alpine，仅服务 dist/ 静态资源 + 反代 /api 到 server
#
# 设计要点：
#   - 多阶段：runtime 镜像不带 node、不带源码、不带 node_modules（alpine ~ 50MB 总大小）
#   - 缓存优化：先复制 lockfile + workspace 配置 + 各 package.json，最后才复制源码
#   - BuildKit 缓存挂载：pnpm store 跨构建复用，省去下载时间
#   - 健康检查：wget --spider /，30s 一次
#
# ============================================
# 镜像体积预期
# ============================================
# base:        nginx:1.27-alpine ≈  40 MB
# dist (Vite build)             ≈   5-15 MB
# ----------------------------------------
# 终态：50-70 MB（预期 ≤ 100 MB）
# ============================================

# ============================================
# Stage 1: builder — 用 pnpm 构建 web SPA
# ============================================
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder

# pnpm 通过 corepack 启用，避免 npm install -g 污染全局
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

WORKDIR /repo

# 1) 先复制 lockfile + workspace 配置 + 所有 package.json + 必要的 tsconfig
#    这样改源码不会破坏 pnpm install 层的缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.node.json apps/web/
COPY packages/ ./packages/

# 2) 装依赖：用 frozen lockfile 保证可复现；--filter 限定到 web + 其依赖
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @apps/web...

# 3) 复制 web 源码
COPY apps/web/ ./apps/web/

# 4) 构建：执行 vue-tsc -b（类型检查 + 项目引用） + vite build（生成 dist/）
RUN pnpm -F @apps/web build

# ============================================
# Stage 2: runtime — nginx 静态服务
# ============================================
FROM nginx:1.27-alpine AS runtime

# 1) 安全：删掉 nginx 默认 default.conf，避免未被引用的 location / 走默认 server
RUN rm -f /etc/nginx/conf.d/default.conf

# 2) 复制 nginx 配置（SPA fallback + /api/ /graphql 反代 + 放宽的 CSP）
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# 3) 复制 web 静态产物（vite build 输出的 dist/ 全部内容）
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html

# 4) 健康检查：每 30s 探测首页，失败 3 次判定 unhealthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

# 5) 暴露 80 端口
EXPOSE 80

# 6) nginx 1.27-alpine 镜像默认 CMD = ["nginx", "-g", "daemon off;"]
