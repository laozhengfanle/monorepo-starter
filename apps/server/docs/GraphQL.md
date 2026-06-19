# GraphQL 规范与 Schema Artifact

> MonoKit 后端采用 **GraphQL（Code-First）+ REST 混合** 架构：复杂数据查询走 GraphQL（自动生成 schema + 类型安全），认证 / CSRF / 上传 / 健康检查等命令式端点走 REST。本文聚焦 GraphQL 部分。

---

## 一、架构概览

```
resolver / @ObjectType / @InputType
        ↓ 装饰器（运行时反射）
@nestjs/graphql
        ↓ Apollo Driver
schema.gql（自动生成）
        ↓
前端 codegen / SDK 生成
```

| 组件 | 选型 | 作用 |
|------|------|------|
| `@nestjs/graphql` | v13 | 装饰器 → Schema 转换 |
| `@nestjs/apollo` | v13 | Apollo Server v5 驱动 |
| `graphql` | v16 | GraphQL 核心库 |
| `graphql-depth-limit` | v1 | 查询深度限制（防 DoS） |

---

## 二、Code-First 开发流

### 1. 定义 ObjectType（响应模型）

```ts
// src/modules/admin/admin-menu/admin-menu.type.ts
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('AdminMenu')
export class AdminMenuType {
    @Field(() => ID)
    id!: string;

    @Field()
    name!: string;

    @Field({ nullable: true })
    icon?: string;
}
```

### 2. 定义 Resolver（Query / Mutation）

```ts
// src/modules/admin/admin-menu/admin-menu.resolver.ts
import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { AdminMenuType } from './admin-menu.type.js';

@Resolver(() => AdminMenuType)
export class AdminMenuResolver {
    @Query(() => AdminMenuType, { name: 'adminMenu' })
    async findOne(@Args('id', { type: () => ID }) id: string) {
        return this.service.findById(id);
    }
}
```

### 3. 自动生成 schema.gql

启动 `pnpm start:dev` 时，`graphql.module.ts` 配置的 `autoSchemaFile: 'graphql/schema.gql'` 会自动把 SDL 写入该文件。**不要手动编辑此文件**。

---

## 三、Schema Artifact

### 为什么需要 artifact

CI 与下游消费者（前端 codegen、SDK 生成器、文档站点）需要拿到**稳定的 SDL 文件**来消费。如果每次都现场 bootstrap NestJS 应用才能生成 SDL，CI 启动慢且依赖重。

所以我们把生成的 SDL 落到 `apps/server/dist/schema.gql`，**提交到 Git**：

```
apps/server/
├── dist/                        # nest build 产物
│   ├── schema.gql               # ← GraphQL SDL artifact（提交到 Git）
│   └── openapi.json             # ← OpenAPI 描述 artifact（提交到 Git）
├── graphql/
│   └── schema.gql               # NestJS GraphQL 自动写盘的源（gitignore）
└── scripts/
    ├── generate-schema-artifact.ts
    └── check-schema-artifact.ts
```

### 生成 artifact

```bash
# 1. 编译源码到 dist/
pnpm build

# 2. 启动编译后的 AppModule，让 GraphQLModule 把 SDL 写到 graphql/schema.gql，
#    然后脚本把它复制到 dist/schema.gql
pnpm generate:schema
```

执行后会产生：

- `apps/server/dist/schema.gql` — GraphQL SDL
- `apps/server/dist/openapi.json` — REST 端点 OpenAPI 3.0 描述

### CI 校验（schema drift check）

```bash
pnpm schema:check
```

比对流程：

1. 读取 `dist/schema.gql`（dev 当前生成的）
2. 读取 `git show HEAD:apps/server/dist/schema.gql`（HEAD 提交时的）
3. 不一致 → exit 1，提示重新生成并提交
4. 一致 → 放行

### 修改 GraphQL schema 的正确流程

```bash
# 1. 改 resolver / @ObjectType
vim src/modules/admin/admin-menu/admin-menu.resolver.ts

# 2. 本地启动确认无运行时错误
pnpm start:dev
# 打开 http://localhost:3000/graphql 测试新字段

# 3. 重新生成 artifact
pnpm build
pnpm generate:schema

# 4. 检查 diff
git diff apps/server/dist/schema.gql

# 5. 提交代码 + artifact
git add src/ apps/server/dist/schema.gql apps/server/dist/openapi.json
git commit -m "feat(admin): 新增菜单分组字段"
```

如果只改了源码、没跑 `pnpm generate:schema`，CI 的 `pnpm schema:check` 会失败，提示「schema artifact 与 HEAD 不一致」。

---

## 四、安全策略

| 维度 | 实现 | 文件 |
|------|------|------|
| 查询深度限制 | `depthLimit(7)` | `src/modules/graphql/graphql.module.ts` |
| 别名数量限制 | `maxAliasesLimitRule(50)` | 同上 |
| 查询复杂度 | 自定义 `calculateComplexity` 插件（阈值 1000） | `src/common/utils/graphql-complexity.ts` |
| 内省（Introspection） | dev 开启 / prod 关闭 | `graphql.module.ts` |
| 字段建议 | prod 屏蔽 "Did you mean ..." | `formatError` |
| 超时控制 | 30 秒 AbortController | `context.abortSignal` |
| 全局错误码 | `10999` 兜底 | `formatError` |
| Body 解析 | `bodyParserConfig: false`（由 main.ts 接管 + 原型链污染防护） | `graphql.module.ts` |

### 内省（Introspection）

- **dev**：`introspection: true`（方便 GraphiQL 调试）
- **prod**：`introspection: false`（防止攻击者通过内省反推 schema）

### 错误格式

所有 GraphQL 错误统一为：

```json
{
    "message": "用户友好的错误消息",
    "extensions": {
        "code": "20003",
        "fields": null
    }
}
```

- `extensions.code` — 业务错误码（与 REST 共享，定义见 `docs/错误码.md`）
- `extensions.fields` — 字段级验证错误（ZodArgsPipe 抛出时填充）
- 生产环境脱敏：`message` 屏蔽字段建议与详细语法错误

---

## 五、性能优化

### N+1 防护（DataLoader）

GraphQL 嵌套查询是 N+1 问题重灾区。本基座在 `src/common/dataloader/` 提供：

- `MenuDataLoader`（按 parentId 批量查子菜单）
- `RoleDataLoader`（按 accountId 批量查角色）
- `PermissionDataLoader`（按 accountId 批量查权限码）

50 个 admin 用户的列表查询，配合 DataLoader 后 SQL 数从 51+ 降到 ≤ 3。

### 复杂度分析

自定义 `calculateComplexity` 在 `didResolveOperation` 钩子中计算查询成本，> 1000 直接拒绝。比 `graphql-query-complexity` 的 `validationRules` 方式更稳：后者在 validation 阶段调用 `getVariableValues()` 会因 variables 未传入而误报「必填变量缺失」。

---

## 六、客户端集成

### 前端 codegen（TypeScript 类型）

```bash
# apps/admin / apps/web 通过 graphql-codegen 生成类型
# 输入：apps/server/dist/schema.gql
# 输出：apps/admin/src/api/__generated__/types.ts
```

详细配置见前端项目的 `codegen.ts`。

### 错误码处理

```ts
// 前端捕获 GraphQL 错误时根据 extensions.code 映射文案
import { ERROR_CODES } from '@packages/shared/errors';

const errCode = error.extensions?.code;
const message = ERROR_CODES[errCode]?.message ?? '未知错误';
```

---

## 七、常见问题

### Q: 我改了 resolver，但 `apps/server/graphql/schema.gql` 没更新？

A: 确保 `pnpm start:dev` 真的启动了，GraphQLModule 只在应用启动时把 SDL 写盘一次。如果改了文件应用没重启就不会重新生成。

### Q: 我不想把 `dist/` 提交到 Git，怎么做？

A: 那就不能用 `pnpm schema:check` 的 Git 比对方案。改用：
- CI 现场 `pnpm build && pnpm generate:schema`，然后跑 snapshot 测试
- 或者把 schema.gql 单独发布到 npm / GitHub Release

本基座默认采用「提交到 Git」方案，权衡是 dist 体积变大但 CI 简单可靠。

### Q: 为什么不用 @nestjs/swagger 生成 OpenAPI？

A: Swagger 装饰器（`@ApiProperty` 等）要侵入式改每个 controller / DTO，属于业务代码改动。本基座的 OpenAPI 描述用「脚本手写精简版」覆盖现有端点，新增端点时开发者同步更新脚本即可。

---

## 八、相关文件

| 路径 | 作用 |
|------|------|
| `src/modules/graphql/graphql.module.ts` | GraphQL 装配 + 安全策略 |
| `src/modules/graphql/common/*.type.ts` | 通用分页 / cursor 类型 |
| `src/common/dataloader/` | DataLoader 抽象层（防 N+1） |
| `src/common/utils/graphql-complexity.ts` | 复杂度分析 |
| `scripts/generate-schema-artifact.ts` | artifact 生成脚本 |
| `scripts/check-schema-artifact.ts` | CI drift 校验脚本 |
| `docs/错误码.md` | 错误码字典 |
