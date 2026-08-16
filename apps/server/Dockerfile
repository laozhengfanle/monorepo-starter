# apps/server/Dockerfile — NestJS 后端多阶段构建（Nx webpack 产物）
#
# 构建：docker build -f apps/server/Dockerfile -t monorepo-server:prod .
# 运行：docker run --rm -p 3301:3301 \
#         -e DATABASE_URL=... -e REDIS_URL=... -e JWT_SECRET=... \
#         monorepo-server:prod
#
# 镜像结构：
#   Stage 1 (deps)    — node:22-alpine，安装全量依赖（含 prisma/swc 等构建工具）
#   Stage 2 (build)   — nx run server:build（webpack → dist/main.js）+ nx run server:prune
#                       （prune-lockfile 生成 dist/package.json + lockfile，copy-workspace-modules
#                         把 workspace 依赖复制进 dist/workspace_modules，得到可独立部署的产物）
#   Stage 3 (runtime) — node:22-alpine，仅装 prod 依赖 + 复制构建产物，非 root 用户 + dumb-init

# ── Stage 1: deps ──
FROM node:22-alpine AS deps

# Prisma 需要 openssl；libc6-compat 兼容部分原生模块
RUN apk add --no-cache openssl libc6-compat
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /workspace

# 先复制清单文件，利用 Docker 层缓存（源码不变时 install 层不失效）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/contracts/package.json ./packages/shared/contracts/
COPY packages/shared/server-core/package.json ./packages/shared/server-core/

# 全量安装（build 需要 devDeps）
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ──
FROM deps AS build

# 复制全部源码
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY openapi/ ./openapi/
COPY nx.json eslint.config.mjs ./

# 构建：server 的 build target 依赖 prisma-generate + ^build（共享包），
# 再用 Nx 的 prune 生成可独立部署的 dist 产物（package.json + lockfile + workspace_modules）
RUN pnpm exec nx run server:build
RUN pnpm exec nx run server:prune

# ── Stage 3: runtime ──
FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl libc6-compat dumb-init

# 非 root 用户（生产安全基线）
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

ENV NODE_ENV=production
WORKDIR /app

# 从 prune 产物装 prod 依赖（dist/package.json 只含生产依赖）
COPY --from=build --chown=nestjs:nodejs /workspace/apps/server/dist/package.json ./package.json
COPY --from=build --chown=nestjs:nodejs /workspace/apps/server/dist/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile

# workspace 依赖（contracts/server-core 的构建产物）与 server 构建产物
COPY --from=build --chown=nestjs:nodejs /workspace/apps/server/dist/workspace_modules ./workspace_modules
COPY --from=build --chown=nestjs:nodejs /workspace/apps/server/dist ./dist

# prisma schema 与迁移（运行时 deploy 用）
COPY --from=build --chown=nestjs:nodejs /workspace/apps/server/prisma ./prisma

# 上传目录
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

USER nestjs
WORKDIR /app
EXPOSE 3301

# dumb-init 转发信号（PID 1 正确响应 SIGTERM，k8s 优雅关闭）
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
