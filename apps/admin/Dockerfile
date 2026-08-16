# apps/admin/Dockerfile — Admin 管理后台多阶段构建
#
# 构建：docker build -f apps/admin/Dockerfile -t monorepo-admin .
# 运行：docker run -d -p 3302:80 --network monorepo-net monorepo-admin
#
# 镜像结构：
#   Stage 1 (builder) — node:22-alpine，安装依赖 + vite build，生成 dist/
#   Stage 2 (runtime) — nginx:1.27-alpine，仅服务 dist/ 静态资源 + 反代 /api /graphql /uploads 到 server
#
# 设计要点：
#   - 多阶段：runtime 镜像不带 node、不带源码、不带 node_modules（约 50-70MB）
#   - 缓存优化：先复制 lockfile + workspace 配置 + package.json，最后才复制源码
#   - BuildKit 缓存挂载：pnpm store 跨构建复用
#   - 健康检查：wget --spider /，30s 一次

# ============================================
# Stage 1: builder — 用 pnpm 构建 admin SPA
# ============================================
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /repo

# 1) 先复制 lockfile + workspace 配置 + 所有 package.json + 必要的 tsconfig
#    这样改源码不会破坏 pnpm install 层的缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/ ./packages/

# 2) 装依赖：frozen lockfile 保证可复现；--filter 限定到 admin + 其依赖
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @starter/admin...

# 3) 复制 admin 源码
COPY apps/admin/ ./apps/admin/

# 4) 构建：vite build（生成 dist/）
#    admin 的 build target 依赖 api-client:generate-api（orval 从 openapi.json 生成），
#    需要先准备 openapi.json；此处直接跑 vite build，跳过 codegen（openapi.json 已入库）
RUN pnpm exec vite build --config apps/admin/vite.config.mts

# ============================================
# Stage 2: runtime — nginx 静态服务
# ============================================
FROM nginx:1.27-alpine AS runtime

# 1) 删掉 nginx 默认 default.conf，避免未被引用的 location / 走默认 server
RUN rm -f /etc/nginx/conf.d/default.conf

# 2) 复制 nginx 配置（SPA fallback + /api/ /graphql /uploads/ 反代 + 安全头）
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf

# 3) 复制 admin 静态产物（vite build 输出的 dist/ 全部内容）
COPY --from=builder /repo/apps/admin/dist /usr/share/nginx/html

# 4) 健康检查：每 30s 探测首页，失败 3 次判定 unhealthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

# 5) 暴露 80 端口
EXPOSE 80
