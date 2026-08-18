# apps/server/Dockerfile — NestJS 后端多阶段构建（Nx webpack 产物）
#
# 构建：docker build -f apps/server/Dockerfile -t monorepo-server:prod .
# 运行：docker run --rm -p 3301:3301 \
#         -e DATABASE_URL=... -e REDIS_URL=... -e JWT_SECRET=... \
#         monorepo-server:prod
#
# 镜像结构：
#   Stage 1 (deps)    — node:24-alpine，安装全量依赖（含 prisma/swc 等构建工具）
#   Stage 2 (build)   — nx run server:build（webpack → dist/main.js）+ nx run server:prune
#                       （prune-lockfile 生成 dist/package.json + lockfile，copy-workspace-modules
#                         把 workspace 依赖复制进 dist/workspace_modules，得到可独立部署的产物）
#   Stage 3 (runtime) — node:24-alpine，仅装 prod 依赖 + 复制构建产物，非 root 用户 + dumb-init
#
# Node 版本说明（P2-10 版本统一）：base 镜像用 node:24-alpine，与 .nvmrc=24 / CI（node 24）/
# package.json engines（>=22.18）对齐。prisma / swc / nx 构建链路在 CI 的 Node 24 上已验证通过；
# 若日后某个原生依赖不支持 Node 24，回退只需把三处 `node:24-alpine` 改回 `node:22-alpine`。

# ── Stage 1: deps ──
FROM node:24-alpine AS deps

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
# 说明（P3 构建上下文精简）：此处整包 COPY apps/ 会把 admin（前端）源码也带进上下文；
#   server 的 nx 构建图只需要 apps/server/，可精简为 `COPY apps/server/ ./apps/server/`
#   （admin 的 package.json 已在 deps 阶段复制，install 不受影响）。保留整包复制是为了
#   避免 nx workspace 图在缺文件时行为变化，属保守选择；.dockerignore 已排除 docs/k8s/.github/.husky。
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY openapi/ ./openapi/
COPY nx.json eslint.config.mjs ./

# 构建：server 的 build target 依赖 prisma-generate + ^build（共享包），
# 再用 Nx 的 prune 生成可独立部署的 dist 产物（package.json + lockfile + workspace_modules）
RUN pnpm exec nx run server:build
RUN pnpm exec nx run server:prune

# ── Stage 3: runtime ──
FROM node:24-alpine AS runtime

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

# 健康检查（容器级基线，P3 基础设施项）：
#   - 探测 /health/liveness（进程存活即可，不依赖 DB）；alpine 自带 busybox wget，无需额外安装
#   - 为什么不打 /health/readiness？readiness 依赖 DB，属于编排层职责：
#     compose 由 depends_on/healthcheck 控制，k8s 由 readinessProbe 控制；镜像级基线只保进程存活
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:3301/health/liveness || exit 1

# dumb-init 转发信号（PID 1 正确响应 SIGTERM，k8s 优雅关闭）
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

# ── Stage 4: migration（一次性迁移镜像，不进运行时镜像） ──
#
# 用途：生产发布时，用此镜像在 CD（compose / k8s）里执行数据库迁移：
#   docker run --rm -e DATABASE_URL=... monorepo-starter-migration:<tag>
#     默认执行 `prisma migrate deploy`；可覆盖 CMD 跑 seed 等其他 prisma 子命令。
#
# 为什么不直接在 runtime 里跑？
#   runtime 用 `pnpm install --prod`（prisma 是 devDependency，被裁掉），没有 prisma CLI。
#   migration 阶段基于 build（已装全量依赖含 prisma CLI + openssl），不额外重复安装，
#   只在发布期构建/使用，保持运行时镜像精简。
#
# 构建：docker build --target migration -t monorepo-starter-migration:<tag> -f apps/server/Dockerfile .
FROM build AS migration

WORKDIR /workspace/apps/server

# 默认执行 migrate deploy（只应用迁移，不改 schema）；覆盖 CMD 可跑 `db seed` 等
ENTRYPOINT ["pnpm", "exec", "prisma"]
CMD ["migrate", "deploy"]
