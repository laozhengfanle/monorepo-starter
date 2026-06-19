# 部署 — Kubernetes

> 本文档说明 MonoKit 全栈在 Kubernetes 集群的部署流程。详细 manifest 与 Kustomize 配置在 [../k8s/](../k8s/) 目录。

## 快速开始

```bash
# 1. 前置依赖（详见 k8s/README.md）
#    - Nginx Ingress Controller
#    - cert-manager + letsencrypt-prod ClusterIssuer
#    - metrics-server（HPA 需要）
#    - Sealed Secrets 或 External Secrets

# 2. 一键部署
kubectl apply -k k8s/

# 3. 验证
kubectl -n monorepo get pods
kubectl -n monorepo get ingress
```

## 目录结构

| 文件                                       | 作用                                     |
| ------------------------------------------ | ---------------------------------------- |
| `namespace.yaml`                           | `monorepo` 命名空间                      |
| `postgres-{pvc,statefulset,service}.yaml`  | PostgreSQL 16 基础设施（10Gi PVC）       |
| `redis-{pvc,statefulset,service}.yaml`     | Redis 7 基础设施（5Gi PVC + AOF 持久化） |
| `server-{deployment,service,ingress}.yaml` | 后端 NestJS（2-5 replica + HPA）         |
| `admin-{deployment,service,ingress}.yaml`  | 管理后台 Vue 3 SPA                       |
| `web-{deployment,service,ingress}.yaml`    | C 端 Vue 3 SPA                           |
| `kustomization.yaml`                       | Kustomize 一键 apply                     |
| `README.md`                                | manifest 详细说明                        |

## 镜像构建

### 本地构建

```bash
# Server（NestJS 后端）
docker build -f apps/server/Dockerfile -t <registry>/monorepo-server:<tag> .

# Admin（管理后台）
docker build -f apps/admin/Dockerfile \
    --build-arg VITE_GRAPHQL_ENDPOINT=/api/graphql \
    --build-arg VITE_TURNSTILE_SITE_KEY=<your-site-key> \
    -t <registry>/monorepo-admin:<tag> .

# Web（C 端）
docker build -f apps/web/Dockerfile \
    --build-arg VITE_GRAPHQL_ENDPOINT=/api/graphql \
    --build-arg VITE_TURNSTILE_SITE_KEY=<your-site-key> \
    -t <registry>/monorepo-web:<tag> .

# 推送
docker push <registry>/monorepo-server:<tag>
docker push <registry>/monorepo-admin:<tag>
docker push <registry>/monorepo-web:<tag>
```

### CI 自动构建

推荐用 GitHub Actions + GHCR（与现有 `.github/workflows/deploy.yml` 配合）：

```yaml
# .github/workflows/build-images.yml
name: Build Images
on:
    push:
        branches: [main]
        tags: ['v*.*.*']
jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: docker/login-action@v3
              with:
                  registry: ghcr.io
                  username: ${{ github.actor }}
                  password: ${{ secrets.GITHUB_TOKEN }}
            - name: Build server
              uses: docker/build-push-action@v6
              with:
                  context: .
                  file: apps/server/Dockerfile
                  push: true
                  tags: ghcr.io/${{ github.repository_owner }}/monorepo-server:${{ github.sha }}
            - name: Build admin
              uses: docker/build-push-action@v6
              with:
                  context: .
                  file: apps/admin/Dockerfile
                  push: true
                  tags: ghcr.io/${{ github.repository_owner }}/monorepo-admin:${{ github.sha }}
                  build-args: |
                      VITE_GRAPHQL_ENDPOINT=/api/graphql
            - name: Build web
              uses: docker/build-push-action@v6
              with:
                  context: .
                  file: apps/web/Dockerfile
                  push: true
                  tags: ghcr.io/${{ github.repository_owner }}/monorepo-web:${{ github.sha }}
                  build-args: |
                      VITE_GRAPHQL_ENDPOINT=/api/graphql
```

## Secrets 管理

> **生产绝对不要把明文 Secret commit 到 Git。** 本节介绍两种主流方案。

### 方案 A：Sealed Secrets（GitOps 友好）

适合：单一 K8s 集群、不方便接云厂商密钥服务。

```bash
# 1. 安装 Sealed Secrets Controller
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# 2. 生成 SealedSecret（加密后提交到 Git）
kubectl create secret generic server-secrets \
    --from-literal=JWT_SECRET=$(openssl rand -hex 32) \
    --from-literal=AES_ENCRYPTION_KEY=$(openssl rand -hex 32) \
    --from-literal=ALLOWED_ORIGINS=https://www.your-domain.com \
    --from-literal=DATABASE_URL=postgresql://user:pass@postgres-service:5432/mono_prod \
    --from-literal=REDIS_URL=redis://redis-service:6379 \
    --dry-run=client -o yaml > /tmp/server-secrets.yaml

kubeseal --format yaml < /tmp/server-secrets.yaml > k8s/secrets/server-secrets-sealed.yaml

# 3. 提交加密文件
rm /tmp/server-secrets.yaml
git add k8s/secrets/server-secrets-sealed.yaml
```

Controller 看到 SealedSecret 后会解密并生成普通 Secret，业务 Pod 通过 `secretRef` 引用。

### 方案 B：External Secrets Operator（云厂商密钥管理）

适合：多集群 / 已有 AWS Secrets Manager / Vault / 阿里云 KMS。

```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
    name: server-secrets
    namespace: monorepo
spec:
    secretStoreRef:
        kind: ClusterSecretStore
        name: aws-secrets-manager
    target:
        name: server-secrets # 生成的 Secret 名称（与 manifest 引用一致）
    data:
        - secretKey: JWT_SECRET
          remoteRef:
              key: monorepo/server
              property: jwt_secret
        - secretKey: AES_ENCRYPTION_KEY
          remoteRef:
              key: monorepo/server
              property: aes_encryption_key
        - secretKey: ALLOWED_ORIGINS
          remoteRef:
              key: monorepo/server
              property: allowed_origins
```

需要先创建 ClusterSecretStore 配置 AWS / Vault 连接：

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
    name: aws-secrets-manager
spec:
    provider:
        aws:
            service: SecretsManager
            region: ap-east-1
            auth:
                jwt:
                    serviceAccountRef:
                        name: external-secrets-sa
                        namespace: external-secrets
```

详细文档：<https://external-secrets.io>

## 数据库迁移

K8s 部署的 server 启动时**不会自动跑 migration**（避免并发问题）。需要手动执行：

```bash
# 方法 1：直接 exec
kubectl -n monorepo exec -it deploy/server -- npx prisma migrate deploy

# 方法 2：一次性 Job（更可控）
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
    name: server-migration
    namespace: monorepo
spec:
    template:
        spec:
            restartPolicy: OnFailure
            containers:
                - name: migrate
                  image: <registry>/monorepo-server:<tag>
                  command: ['npx', 'prisma', 'migrate', 'deploy']
                  envFrom:
                      - secretRef:
                            name: server-secrets
EOF

# 等 Job 完成后清理
kubectl -n monorepo delete job server-migration
```

## 升级与回滚

### 滚动升级

K8s 默认行为：先起新 Pod → readiness 通过 → 删旧 Pod。配置在 `server-deployment.yaml`：

```yaml
strategy:
    type: RollingUpdate
    rollingUpdate:
        maxSurge: 1 # 最多同时多 1 个新 Pod
        maxUnavailable: 0 # 任何时候旧 Pod 都不能全挂
```

### 触发升级

```bash
# 方法 1：修改 kustomization.yaml 的 newTag
# 编辑 k8s/kustomization.yaml 后 kubectl apply -k k8s/

# 方法 2：直接 set image
kubectl -n monorepo set image deployment/server \
    server=<registry>/monorepo-server:v1.0.1 \
    --record

# 查看滚动状态
kubectl -n monorepo rollout status deployment/server
```

### 回滚

```bash
# 查看历史
kubectl -n monorepo rollout history deployment/server

# 回滚到上一版
kubectl -n monorepo rollout undo deployment/server

# 回滚到指定版本
kubectl -n monorepo rollout undo deployment/server --to-revision=3
```

## 监控接入

### Prometheus 抓取

Server 在 `/metrics` 暴露 Prometheus 格式指标（端口 3000）。用 ServiceMonitor 让 Prometheus 抓取：

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
    name: server-metrics
    namespace: monorepo
    labels:
        release: prometheus # 与你的 prometheus operator release 标签一致
spec:
    selector:
        matchLabels:
            app: server
    endpoints:
        - port: http
          path: /metrics
          interval: 30s
```

### Grafana Dashboard

推荐指标看板包含：

| 指标                            | 用途             | 告警阈值   |
| ------------------------------- | ---------------- | ---------- |
| `http_requests_total`           | QPS              | —          |
| `http_request_duration_seconds` | 延迟 P50/P95/P99 | P99 > 1s   |
| `http_requests_in_flight`       | 在飞请求数       | > 100      |
| `node_cpu_utilization`          | CPU 使用率       | > 80%      |
| `node_memory_utilization`       | 内存使用率       | > 80%      |
| `pg_stat_activity_count`        | DB 活跃连接      | > 80% pool |
| `redis_connected_clients`       | Redis 连接数     | —          |

## 数据库与缓存

### 自建 vs 云托管

K8s 内自建 PG / Redis：

- ✅ 完全可控 / 成本低（用云盘）
- ❌ 运维成本高（备份、HA、版本升级）

生产推荐：**云托管 RDS / ElastiCache + K8s 内的 Pod 通过 ExternalName Service 访问**：

```yaml
# rds-external-service.yaml
apiVersion: v1
kind: Service
metadata:
    name: postgres-service # 与 StatefulSet service 同名，无缝切换
    namespace: monorepo
spec:
    type: ExternalName
    externalName: monorepo-prod.cluster-xxxxx.ap-east-1.rds.amazonaws.com
```

Server Deployment 的 env `DATABASE_URL` 不用改。

### 备份策略

PG 用云厂商自动备份（Point-in-Time Recovery）；Redis 用云厂商自动快照。K8s 内自建时建议：

```yaml
# postgres-backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
    name: postgres-backup
    namespace: monorepo
spec:
    schedule: '0 2 * * *' # 每天凌晨 2 点
    jobTemplate:
        spec:
            template:
                spec:
                    restartPolicy: OnFailure
                    containers:
                        - name: backup
                          image: postgres:16-alpine
                          command:
                              - sh
                              - -c
                              - |
                                  pg_dump -Fc -h postgres-service -U $PGUSER $PGDATABASE | \
                                  aws s3 cp - s3://$BACKUP_BUCKET/postgres/$(date +%Y%m%d).dump
                          env:
                              - name: PGPASSWORD
                                valueFrom:
                                    secretKeyRef:
                                        name: postgres-credentials
                                        key: password
```

## 故障排查

```bash
# Pod 启动失败
kubectl -n monorepo describe pod <pod-name>
kubectl -n monorepo logs <pod-name> --previous

# 服务无法访问
kubectl -n monorepo get endpoints server-service
# 如果 ENDPOINTS 为空，说明 selector 没匹配到 Pod

# HPA 不扩容
kubectl -n monorepo describe hpa server-hpa
# 检查 metrics-server 是否安装、Pod metrics 能否采集

# Ingress 404
kubectl -n monorepo describe ingress server-ingress
# 检查 backend service name + port 是否正确
```

## 与 docker-compose 的关系

| 维度       | docker-compose               | K8s                    |
| ---------- | ---------------------------- | ---------------------- |
| 目标       | 本地开发 / 单机部署          | 生产 / 多节点高可用    |
| 配置       | YAML in `docker-compose.yml` | K8s manifest in `k8s/` |
| 数据持久化 | named volumes                | PVC                    |
| 密钥管理   | .env 文件                    | Secret / SealedSecret  |
| 入口       | 端口映射 + Nginx             | Ingress                |
| 扩缩容     | 手动                         | HPA 自动               |
| 监控       | docker stats                 | Prometheus + Grafana   |

新项目建议先用 docker-compose 跑通本地，再迁移到 K8s。两套配置的差异主要在「基础设施层」（PG / Redis / 入口），业务镜像层完全一致。

## 完整文档

详细 manifest 字段说明、Pod 安全、Resource 调优等见 [k8s/README.md](../k8s/README.md)。
