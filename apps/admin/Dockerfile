# apps/admin/Dockerfile — Admin 管理后台多阶段构建
#
# 构建：docker build -f apps/admin/Dockerfile -t monorepo-admin .
# 运行：docker run -d -p 3302:80 --network monorepo-net \
#         -e UPSTREAM_SERVER=server:3301 \
#         monorepo-admin
#
# 镜像结构：
#   Stage 1 (builder) — node:24-alpine，安装依赖 + vite build，生成 dist/
#   Stage 2 (runtime) — nginx:1.27-alpine + envsubst（gettext），服务 dist/ 静态资源 + 反代
#
# Node 版本说明（P2-10 版本统一）：builder 用 node:24-alpine，与 .nvmrc=24 / CI（node 24）对齐。
#
# 设计要点：
#   - 多阶段：runtime 镜像不带 node、不带源码、不带 node_modules（约 50-70MB）
#   - 缓存优化：先复制 lockfile + workspace 配置 + package.json，最后才复制源码
#   - BuildKit 缓存挂载：pnpm store 跨构建复用
#   - 反代上游通过 UPSTREAM_SERVER 注入：
#       * compose：docker-compose.yml 设 UPSTREAM_SERVER=server:3301
#       * k8s：    admin-deployment env 注入 UPSTREAM_SERVER=server-service:3301
#   - 配置模板渲染：容器启动时 entrypoint 用 envsubst 替换 ${UPSTREAM_SERVER}，
#     渲染结果写到 /var/cache/nginx/default.conf（emptyDir，readOnlyRootFilesystem 友好）
#   - 健康检查：wget --spider /，30s 一次

# ============================================
# Stage 1: builder — 用 pnpm 构建 admin SPA
# ============================================
# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder

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
#    admin 直接引用 @starter/api-client 已提交的生成类型（src/generated/** 入库），
#    无需在镜像内跑 orval codegen（openapi.json 是生成物、不入库——方案 A）；
#    若后续 api-client generated 改为 CI 现生成，则此处需先跑 nx run @starter/api-client:generate-api
RUN pnpm exec vite build --config apps/admin/vite.config.mts

# ============================================
# Stage 2: runtime — nginx 静态服务
# ============================================
FROM nginx:1.27-alpine AS runtime

# 1) 装 envsubst（gettext 包提供）
RUN apk add --no-cache gettext

# 2) 删掉 nginx 默认 default.conf（避免未被引用的 location / 走默认 server）
RUN rm -f /etc/nginx/conf.d/default.conf

# 3) 复制 nginx 配置为模板（不会被 nginx 自动加载，仅 entrypoint 渲染用）
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf.template

# 4) 复制 stub 配置：把渲染产物 include 进 http {} 块
#    渲染产物写在 /var/cache/nginx/default.conf（emptyDir），避免污染 readOnlyRootFilesystem
COPY apps/admin/nginx-stub.conf /etc/nginx/conf.d/00-render-include.conf

# 5) 复制 entrypoint 脚本（envsubst 渲染 + exec nginx）
COPY apps/admin/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 6) 复制 admin 静态产物（vite build 输出的 dist/ 全部内容）
COPY --from=builder /repo/apps/admin/dist /usr/share/nginx/html

# 7) 健康检查：每 30s 探测健康端点，失败 3 次判定 unhealthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/healthz || exit 1

# 8) 暴露 80 端口
EXPOSE 80

# 9) 自定义 entrypoint：渲染模板 + 启动 nginx（覆盖 nginx 镜像默认 entrypoint）
ENTRYPOINT ["/docker-entrypoint.sh"]
