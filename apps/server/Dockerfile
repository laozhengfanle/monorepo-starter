# 生产模式 Dockerfile（多阶段构建）
#
# 设计意图：
# - deps 阶段：装全量依赖（含 devDeps，因为 build 阶段需要 prisma CLI / swc）
# - build 阶段：prisma generate + swc 编译
# - runtime 阶段：极简镜像（node:22-alpine + dist + production deps）
# - 非 root 用户跑：生产安全基线
# - dumb-init 转发信号：PID 1 正确响应 SIGTERM（k8s rolling update 优雅关闭）
#
# 构建命令：
#   docker build -f apps/server/Dockerfile -t monorepo-server:prod .
# 跑命令：
#   docker run --rm -p 3000:3000 \
#     -e DATABASE_URL=... -e REDIS_URL=... -e JWT_SECRET=... \
#     monorepo-server:prod

# ── Stage 1: deps ──
# 装全量依赖（devDeps 包含 swc、prisma CLI 等 build 工具）
FROM node:22-alpine AS deps

RUN apk add --no-cache openssl libc6-compat
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# patches/ 必须在 pnpm install 之前 copy：pnpm-workspace.yaml.patchedDependencies 引用
COPY patches/ ./patches/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
COPY apps/server/package.json ./apps/server/
COPY apps/admin/package.json ./apps/admin/
COPY apps/web/package.json ./apps/web/

# --frozen-lockfile 锁版本；这里可以跑 scripts（prisma postinstall 等）
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ──
FROM deps AS build

# 复制源代码
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

# 跑生产构建：prisma generate + swc 编译
# nest-cli.json + .swcrc 都在 apps/server/ 下，cwd 切过去
# 只跑 client generator，跳过 erd（puppeteer/chrome 在 runtime 镜像不存在）
# 顺序：先 build shared（apps/server 依赖产物）→ 再 build server
WORKDIR /app/packages/shared
RUN pnpm build
WORKDIR /app/apps/server
# 只跑 client generator（跳过 erd，puppeteer/chrome 在 runtime 镜像不存在）
# 编译链路：prisma generate (.ts) → nest build (src/*.ts → dist/*.js) → compile-prisma-client (.ts → .js 同位置)
RUN pnpm exec prisma generate --generator client && pnpm build

# ── Stage 3: prune dev deps ──
# 从 deps 阶段起步（有全量 node_modules），复制 build 产物后 prune 掉 devDependencies
FROM deps AS prune

# 复制 build 产物（dist + prisma generated client + shared dist）
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/scripts ./apps/server/scripts
COPY --from=build /app/apps/server/graphql ./apps/server/graphql

# 移除 devDependencies，只保留 production deps
RUN pnpm prune --prod

# ── Stage 4: runtime ──
FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl libc6-compat dumb-init

# 非 root 用户
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

ENV NODE_ENV=production
WORKDIR /app

# 从 prune 阶段复制（已去除 devDependencies 的生产依赖）
COPY --from=prune --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prune --chown=nestjs:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prune --chown=nestjs:nodejs /app/apps/server/node_modules ./apps/server/node_modules

# 复制 build 产物：dist（含 swc 编译后的 JS）、prisma generated client、schema
COPY --from=prune --chown=nestjs:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=prune --chown=nestjs:nodejs /app/apps/server/prisma ./apps/server/prisma
COPY --from=prune --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=prune --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=prune --chown=nestjs:nodejs /app/apps/server/package.json ./apps/server/package.json
COPY --from=prune --chown=nestjs:nodejs /app/apps/server/scripts ./apps/server/scripts
COPY --from=prune --chown=nestjs:nodejs /app/apps/server/graphql ./apps/server/graphql

# 切到非 root 用户
USER nestjs

WORKDIR /app/apps/server
EXPOSE 3000

# dumb-init 转发信号，PID 1 处理 SIGTERM
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
