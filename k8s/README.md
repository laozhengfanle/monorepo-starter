# K8s 部署

> MonoKit 全栈 K8s manifest 一键部署。基于 Kustomize，提供命名空间、PostgreSQL、Redis、后端、Admin、Web 完整骨架。

## 目录结构

```
k8s/
├── README.md                  # 本文件：部署指南
├── kustomization.yaml         # Kustomize 一键 apply
├── namespace.yaml             # monorepo 命名空间
│
├── postgres-pvc.yaml          # PG 持久卷（10Gi）
├── postgres-statefulset.yaml  # PG StatefulSet
├── postgres-service.yaml      # PG ClusterIP Service
│
├── redis-pvc.yaml             # Redis 持久卷（5Gi）
├── redis-statefulset.yaml     # Redis StatefulSet
├── redis-service.yaml         # Redis ClusterIP Service
│
├── server-deployment.yaml     # 后端 Deployment（2 replica + HPA）
├── server-service.yaml        # 后端 Service
├── server-ingress.yaml        # 后端 Ingress（/api + /graphql）
│
├── admin-deployment.yaml      # 管理后台 Deployment
├── admin-service.yaml         # 管理后台 Service
├── admin-ingress.yaml         # 管理后台 Ingress
│
├── web-deployment.yaml        # C 端 Deployment
├── web-service.yaml           # C 端 Service
└── web-ingress.yaml           # C 端 Ingress
```

## 前置依赖

部署前确保 K8s 集群已安装以下组件：

| 组件                                                | 用途                  | 安装参考                                             |
| --------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| **Nginx Ingress Controller**                        | 提供 Ingress 资源     | <https://kubernetes.github.io/ingress-nginx/deploy/> |
| **cert-manager** + `letsencrypt-prod` ClusterIssuer | 自动签发 TLS 证书     | <https://cert-manager.io/docs/installation/>         |
| **metrics-server**                                  | HPA 需要 CPU/内存指标 | <https://github.com/kubernetes-sigs/metrics-server>  |
| **Sealed Secrets / External Secrets**               | 生产 secrets 注入     | <https://github.com/bitnami-labs/sealed-secrets>     |

## 一键部署

```bash
# 1. 应用所有资源
kubectl apply -k k8s/

# 2. 查看部署状态
kubectl -n monorepo get pods
kubectl -n monorepo get svc
kubectl -n monorepo get ingress
```

预期输出：

```
NAME                          READY   STATUS    RESTARTS   AGE
postgres-0                    1/1     Running   0          2m
redis-0                       1/1     Running   0          2m
server-xxx                    1/1     Running   0          1m
server-yyy                    1/1     Running   0          1m
admin-xxx                     1/1     Running   0          1m
web-xxx                       1/1     Running   0          1m
```

## 配置自定义

### 替换镜像仓库

修改 `kustomization.yaml` 的 `images` 段：

```yaml
images:
    - name: server
      newName: ghcr.io/your-org/monorepo-server
      newTag: v1.0.0
    - name: admin
      newName: ghcr.io/your-org/monorepo-admin
      newTag: v1.0.0
    - name: web
      newName: ghcr.io/your-org/monorepo-web
      newTag: v1.0.0
```

或者用环境变量批量替换：

```bash
export IMAGE_TAG=v1.0.0
cd k8s
for f in server-deployment.yaml admin-deployment.yaml web-deployment.yaml; do
    envsubst < $f | kubectl apply -f -
done
```

### 替换域名

修改各 `*-ingress.yaml`：

- `server-ingress.yaml`：`host: api.your-domain.com` + `secretName: server-tls`
- `admin-ingress.yaml`：`host: admin.your-domain.com` + `secretName: admin-tls`
- `web-ingress.yaml`：`host: www.your-domain.com` + `secretName: web-tls`

### 资源调优

`server-deployment.yaml` 默认 2 replica + 256-512Mi memory。生产建议：

```yaml
spec:
    replicas: 3
    resources:
        requests:
            memory: 512Mi
            cpu: 500m
        limits:
            memory: 1Gi
            cpu: '1'
```

## Secrets 管理

manifest 中的敏感值都引用了 `Secret` 资源（如 `server-secrets`、`postgres-credentials`）。**生产环境务必不要把这些 Secret 直接 commit 到 Git**。

### 推荐方案

#### 方案 A：Sealed Secrets（GitOps 友好）

```bash
# 1. 安装 Sealed Secrets Controller
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# 2. 创建普通 Secret，然后用 kubeseal 加密
kubectl create secret generic server-secrets \
    --from-literal=JWT_SECRET=$(openssl rand -hex 32) \
    --from-literal=AES_ENCRYPTION_KEY=$(openssl rand -hex 32) \
    --from-literal=ALLOWED_ORIGINS=https://www.your-domain.com \
    --dry-run=client -o yaml > server-secrets.yaml

kubeseal --format yaml < server-secrets.yaml > server-secrets-sealed.yaml

# 3. 提交加密后的文件，删除明文版本
rm server-secrets.yaml
git add server-secrets-sealed.yaml
```

#### 方案 B：External Secrets Operator（云厂商密钥管理）

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
        name: server-secrets
    data:
        - secretKey: JWT_SECRET
          remoteRef:
              key: monorepo/server
              property: jwt_secret
```

完整文档：<https://external-secrets.io/>

## 数据库初始化

PG StatefulSet 启动后，需要手动跑 Prisma migration：

```bash
# 1. 在 server Pod 内执行 migrate
kubectl -n monorepo exec -it deploy/server -- npx prisma migrate deploy

# 2. 灌入 seed 数据
kubectl -n monorepo exec -it deploy/server -- npx prisma db seed
```

或用一次性 Job：

```yaml
# migration-job.yaml
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
                      - configMapRef:
                            name: server-config
                      - secretRef:
                            name: server-secrets
```

## 升级与回滚

### 升级镜像版本

```bash
# 方法 1：改 kustomization.yaml 的 newTag，再 apply
kubectl apply -k k8s/

# 方法 2：直接 set image
kubectl -n monorepo set image deployment/server server=<registry>/monorepo-server:v1.0.1
```

### 回滚

```bash
# 查看历史版本
kubectl -n monorepo rollout history deployment/server

# 回滚到上一版
kubectl -n monorepo rollout undo deployment/server

# 回滚到指定版本
kubectl -n monorepo rollout undo deployment/server --to-revision=2
```

## 监控

Server Pod 暴露 Prometheus 指标（端口 3000 路径 `/metrics`）。生产环境**不要**把 `/metrics` 暴露到 Ingress，而是用 Prometheus 走集群内网络抓取：

```yaml
# prometheus-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
    name: server-metrics
    namespace: monorepo
spec:
    selector:
        matchLabels:
            app: server
    endpoints:
        - port: http
          path: /metrics
          interval: 30s
```

## 排错

```bash
# 查看 Pod 详情
kubectl -n monorepo describe pod <pod-name>

# 查看日志
kubectl -n monorepo logs -f deployment/server

# 进入 Pod 调试
kubectl -n monorepo exec -it <pod-name> -- sh

# 查看 HPA 状态
kubectl -n monorepo get hpa
kubectl -n monorepo describe hpa server-hpa
```

## 生产 Checklist

- [ ] PG / Redis StatefulSet 替换为云托管 RDS / ElastiCache
- [ ] Secret 用 Sealed Secrets 或 External Secrets 注入
- [ ] Ingress 域名替换为实际域名
- [ ] cert-manager 签发真实证书（不是 staging）
- [ ] HPA 调优：CPU 70% / Memory 80% 视实际负载调整
- [ ] Resource limits 调高：server 1Gi+ / PG 4Gi+ / Redis 1Gi+
- [ ] 启用 NetworkPolicy 限制 namespace 间流量（模板已提供 `network-policy.yaml`）
- [ ] PodDisruptionBudget 防止主动驱逐时全挂
- [ ] Backup CronJob 定时备份 PG
- [ ] Prometheus + Grafana 接入 `/metrics`
- [ ] 日志收集（EFK / Loki）
