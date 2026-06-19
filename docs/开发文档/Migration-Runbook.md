# 数据库迁移运行手册（Migration Runbook）

> **适用对象**：需要执行 Prisma migrate 的开发者 / DBA / 运维
>
> **使用场景**：dev 环境初始化、生产环境部署、紧急回滚
>
> **核心原则**：**永远先备份，再操作**。生产环境的迁移一旦出错，回滚成本可能非常高。

---

## 0. 决策树

```
需要改 schema？
├── 是 → 进入本文档
│   ├── dev 环境：直接 `prisma migrate dev`
│   ├── 生产环境：进入"生产部署流程"
│   └── 紧急回滚：进入"回滚脚本"
└── 否 → 不需要读本文档
```

---

## 1. 备份流程（生产环境必做）

### 1.1 全量备份（pg_dump）

```bash
# 1. 设置变量
export PGHOST=db.example.com
export PGPORT=5432
export PGUSER=mono_prod
export PGPASSWORD=xxx  # 从密钥管理获取
export PGDATABASE=mono_prod

# 2. 时间戳（用于文件名）
TS=$(date +%Y%m%d_%H%M%S)

# 3. 全量 dump（自定义格式，支持并行恢复）
pg_dump -Fc -v -f "/backup/mono_prod_${TS}.dump" "$PGDATABASE"

# 4. 验证 dump 文件大小（> 0 即认为成功）
ls -lh "/backup/mono_prod_${TS}.dump"
```

**参数说明**：

- `-Fc`：自定义格式（压缩 + 并行恢复）
- `-v`：verbose
- `-f`：输出文件

### 1.2 仅 schema 备份（轻量）

```bash
# 只备份 DDL，不含数据（用于快速对比 schema 差异）
pg_dump --schema-only -f "/backup/mono_schema_${TS}.sql" "$PGDATABASE"
```

### 1.3 上传到对象存储

```bash
# 阿里云 OSS
oss cp "/backup/mono_prod_${TS}.dump" "oss://mono-backups/db/${TS}/"

# AWS S3
aws s3 cp "/backup/mono_prod_${TS}.dump" "s3://mono-backups/db/${TS}/"
```

> **保留策略**：最近 7 天每日备份 + 最近 12 个月每月备份。

---

## 2. Dry-run 流程（生产部署前必做）

### 2.1 在 staging 环境先跑一次

```bash
# 1. 同步生产 schema 到 staging（用于真实测试）
#    ⚠️ 不要直接拉生产数据，用脱敏后的快照

# 2. 部署新代码到 staging
kubectl apply -f k8s/staging/

# 3. 等待 pod ready
kubectl rollout status deployment/mono-server -n staging

# 4. 跑 dry-run（不实际执行）
pnpm prisma migrate diff \
  --from-url "$STAGING_DATABASE_URL" \
  --to-schema-datamodel apps/server/prisma/schema.prisma \
  --script
```

### 2.2 检查 SQL 是否符合预期

会输出类似：

```sql
-- DropIndex
DROP INDEX "audit_log_account_id_idx";

-- AlterTable
ALTER TABLE "account" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "account_user_type_idx" ON "account"("user_type");
```

**重点检查**：

- [ ] 没有意外的 `DROP TABLE`（如果出现要立即停止）
- [ ] 没有锁表过久的 `ALTER TABLE`（大表加列要 `CONCURRENTLY`）
- [ ] 索引删除/创建顺序合理
- [ ] 字段类型变更不会丢数据（如 `VARCHAR(50)` → `VARCHAR(100)` 安全，反之危险）

### 2.3 估算锁等待时间

```bash
# 在生产从库跑 EXPLAIN 看 ALTER TABLE 影响
EXPLAIN ALTER TABLE "account" ADD COLUMN "token_version" INTEGER;
```

> 大表（> 1 亿行）加列考虑：
>
> - PostgreSQL 11+：`ALTER TABLE ... ADD COLUMN ... DEFAULT ... NOT NULL` 已不锁表
> - 创建索引用 `CREATE INDEX CONCURRENTLY`（不锁表）
> - 但 Prisma 生成的 SQL 不会自动 CONCURRENTLY，需要手动改 migration 文件

---

## 3. 生产部署流程（灰度发布）

### 3.1 灰度步骤

```
Step 1: 备份        ← 不可跳过
Step 2: 应用迁移     ← 维护窗口
Step 3: 1 实例验证   ← 灰度
Step 4: 全量发布     ← 放量
Step 5: 监控 + 待命  ← 观察
```

### 3.2 Step 1：备份

见 § 1。

### 3.3 Step 2：应用迁移

**选项 A：维护窗口（downtime）**

```bash
# 1. 把所有流量切走（负载均衡摘除 / 切维护页）
kubectl scale deployment/mono-server --replicas=0 -n production

# 2. 等待 30s 让负载均衡踢干净
sleep 30

# 3. 应用迁移
pnpm prisma migrate deploy

# 4. 验证
pnpm prisma migrate status

# 5. 启动 1 个实例
kubectl scale deployment/mono-server --replicas=1 -n production
```

**选项 B：滚动升级（无 downtime，推荐）**

```bash
# 1. 提前 24h 跑 "扩展列" 类型的迁移（不锁表）
pnpm prisma migrate deploy

# 2. 部署新代码（多实例滚动）
kubectl set image deployment/mono-server \
  mono-server=mono-server:v1.2.0 -n production

# 3. 观察 5min
kubectl rollout status deployment/mono-server -n production
```

**选项 C：扩展 + 收缩（zero-downtime，最稳）**

```bash
# 1. 旧代码兼容新 schema
# 2. 跑迁移
pnpm prisma migrate deploy
# 3. 部署新代码（滚动）
# 4. 旧代码被踢出
```

### 3.4 Step 3：1 实例验证

```bash
# 1. 缩到 1 实例
kubectl scale deployment/mono-server --replicas=1 -n production

# 2. 健康检查
curl https://api.example.com/health
# 期望：{"status":"ok","database":"ok","redis":"ok"}

# 3. 冒烟测试（核心 API）
curl -X POST https://api.example.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id nickname } }"}'

# 4. 跑 5min 监控（错误率 / 延迟）
```

### 3.5 Step 4：全量发布

```bash
# 缩到正常副本数
kubectl scale deployment/mono-server --replicas=3 -n production
```

### 3.6 Step 5：监控 + 待命

观察至少 30 分钟：

- [ ] 错误率 < 0.1%
- [ ] P99 延迟 < 基线 1.5x
- [ ] DB 连接数 < 80% 容量
- [ ] 没有 lock 等待

---

## 4. 回滚脚本

### 4.1 代码回滚（最常见）

```bash
# 1. Helm / kubectl 回滚到上一个版本
kubectl rollout undo deployment/mono-server -n production

# 2. 验证
kubectl rollout status deployment/mono-server -n production
```

> 注意：**只能回滚 schema 兼容的代码**。如果迁移加了 `NOT NULL` 字段，旧代码读不到该字段会报错。

### 4.2 数据库回滚（危险，慎用）

```bash
# 1. 立即停止所有应用（防止新数据写入）
kubectl scale deployment/mono-server --replicas=0 -n production

# 2. 标记失败的迁移为 "rolled back"
pnpm prisma migrate resolve --rolled-back 20260616000000_add_token_version

# 3. 如果有 "down" SQL，手动跑（Prisma 不自动生成 down migration）
psql "$DATABASE_URL" -c "ALTER TABLE account DROP COLUMN token_version;"

# 4. 从备份恢复（最彻底）
pg_restore -Fc -d "$PGDATABASE" -c "/backup/mono_prod_20260615_020000.dump"
# ⚠️ -c 会先 drop 所有对象再创建，会丢失备份后的所有数据

# 5. 重新启动应用
kubectl scale deployment/mono-server --replicas=3 -n production
```

### 4.3 部分回滚（推荐）

```bash
# 用 prisma migrate resolve 标记特定迁移失败（不跑 down）
# 保留 DB 状态，只回滚代码
pnpm prisma migrate resolve --rolled-back 20260616000000_add_token_version

# 回滚代码到兼容版本
kubectl rollout undo deployment/mono-server -n production
```

---

## 5. 故障排查 FAQ

### Q1：`prisma migrate deploy` 报错 "P3009 migrate found failed migrations"

**原因**：之前的迁移失败但没 resolve。

**解决**：

```bash
# 1. 查看失败原因
pnpm prisma migrate status

# 2. 标记为 rolled back（如果不想跑）
pnpm prisma migrate resolve --rolled-back 20260616000000_xxx

# 3. 标记为 applied（如果已经手动跑过 SQL）
pnpm prisma migrate resolve --applied 20260616000000_xxx
```

### Q2：迁移一直卡住不返回

**原因**：可能有 lock 等待。

**解决**：

```sql
-- 查看当前长事务
SELECT pid, query, state, wait_event, wait_event_type
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- 杀掉阻塞的 migration 进程（谨慎！）
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE query LIKE '%prisma%'
  AND state = 'active';
```

### Q3：生产环境大表加列超时

**原因**：`ALTER TABLE ADD COLUMN` 在老版本 PG 上会锁表。

**解决**：

```sql
-- 使用 CONCURRENTLY（索引场景）
CREATE INDEX CONCURRENTLY idx_name ON table_name(column);

-- 加列带默认值（PG 11+ 不锁表）
ALTER TABLE account ADD COLUMN token_version INT NOT NULL DEFAULT 0;
```

### Q4：migration 文件名冲突

**原因**：两个 PR 同时起了同名 migration。

**解决**：

```bash
# 重新命名本地文件
mv apps/server/prisma/migrations/20260616000000_xxx \
   apps/server/prisma/migrations/20260616000001_xxx

# 更新 _prisma_migrations 表
psql "$DATABASE_URL" -c "
UPDATE _prisma_migrations
SET migration_name = '20260616000001_xxx'
WHERE migration_name = '20260616000000_xxx';
"
```

### Q5：Staging 和生产的 migration 漂移

**原因**：Staging 跑了一个 migration 但生产没跑（或反之）。

**解决**：

```bash
# 1. 对比两边的 _prisma_migrations 表
psql "$STAGING_DATABASE_URL" -c "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name;"
psql "$PROD_DATABASE_URL" -c "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name;"

# 2. 把缺失的 migration 补上
pnpm prisma migrate deploy
```

### Q6：seed 跑挂了

**解决**：

```bash
# 1. 查看 seed 脚本
cat apps/server/prisma/seed.ts

# 2. 手动跑
pnpm prisma db seed

# 3. 如果有幂等性要求，检查 seed 是否用 upsert / createMany({ skipDuplicates: true })
```

### Q7：rollback 后 token / session 全部失效

**原因**：rollback 加的字段被 drop，所有引用该字段的 code 都崩。

**缓解**：

- 提前 24h 用「双写 + 灰度读新字段」模式
- 详见 [ADR 0003 - Token Rotation 的"双密钥验证"](./adr/0003-token-rotation.md)

### Q8：迁移后 `prisma generate` 报错

**原因**：schema.prisma 改了但没跑 `prisma generate`。

**解决**：

```bash
# 1. 跑 generate
pnpm prisma generate

# 2. 重启 IDE（VSCode Prisma 插件需要重启）

# 3. CI 流水线确保 `prisma generate` 在 `build` 之前
```

---

## 6. 紧急联系

| 级别              | 联系方式               | 响应时间 |
| ----------------- | ---------------------- | -------- |
| P0 - 生产不可用   | oncall@mono.com + 电话 | 15min    |
| P1 - 部分功能异常 | oncall@mono.com        | 1h       |
| P2 - 非阻塞       | #dev-ops Slack 频道    | 4h       |
| P3 - 咨询         | GitHub Issue           | 24h      |

---

## 7. 相关文档

- [Prisma 迁移文档](https://www.prisma.io/docs/orm/prisma-migrate)
- [PostgreSQL 备份恢复](https://www.postgresql.org/docs/current/backup.html)
- [ADR 0004 - 软删除策略](./adr/0004-soft-delete-strategy.md)
- [部署运维](./部署运维.md)
