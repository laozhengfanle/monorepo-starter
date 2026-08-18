#!/bin/sh
# apps/admin/docker-entrypoint.sh — admin 容器入口脚本
#
# 职责：
#   1. 渲染 nginx 配置模板：/etc/nginx/conf.d/default.conf.template（含 ${UPSTREAM_SERVER} 占位）
#      → /var/cache/nginx/default.conf（emptyDir 可写挂载点，避免污染 readOnlyRootFilesystem）
#   2. 启动 nginx（前台运行，PID 1 由 shell 接住，SIGTERM 透传给 nginx）
#
# 环境变量：
#   UPSTREAM_SERVER  反代上游 server 地址
#                    - compose: server:3301
#                    - k8s:     server-service:3301（由 admin-deployment env 注入）
#                    必填；缺失则渲染失败，nginx 启动时也会因 upstream 无效报 502
set -eu

# 必须有 UPSTREAM_SERVER（envsubst 不会因此报错，但缺值会让 upstream 失效）
if [ -z "${UPSTREAM_SERVER:-}" ]; then
    echo "[entrypoint] ERROR: UPSTREAM_SERVER env is required" >&2
    exit 1
fi

# 渲染模板（仅替换 ${UPSTREAM_SERVER}，其他 $ 字符由 nginx 自己解析）
mkdir -p /var/cache/nginx
envsubst '${UPSTREAM_SERVER}' < /etc/nginx/conf.d/default.conf.template > /var/cache/nginx/default.conf

echo "[entrypoint] nginx config rendered with UPSTREAM_SERVER=${UPSTREAM_SERVER}"

# exec 让 nginx 接管 PID 1，SIGTERM 由 nginx 直接接收（k8s 优雅关闭）
exec nginx -g 'daemon off;'
