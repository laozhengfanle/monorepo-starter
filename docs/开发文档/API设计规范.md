# API 设计规范

> REST + GraphQL 的响应约定、错误码规范、命名规范、分页约定。所有后端接口必须遵守本文。

## 1. 总原则

- **输入**：统一由 `@starter/contracts` 的 zod schema 校验（`ZodValidationPipe` / `ZodArgsPipe`）。
- **成功**：直接返回领域数据，**不包 envelope**。
- **失败**：统一错误结构，前端只认一种错误形状。
- **认证**：`Authorization: Bearer <accessToken>`。

## 2. REST 响应约定

### 2.1 成功

```json
// GET /api/.../list → 200
{
  "items": [/* 领域数据 */],
  "meta": { "page": 1, "pageSize": 20, "total": 156 }
}
```

成功响应直接返回领域数据（与 `openapi/openapi.json` 的 200 schema 一致），分页时 `meta` 携带分页元数据。

### 2.2 失败（统一 envelope）

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "用户名或密码错误",
    "details": { "remainingAttempts": ["3"] }
  }
}
```

契约定义（`@starter/contracts` → `api-envelope.ts`）：

```ts
export interface ApiError {
  /** 业务错误码，如 'USER_NOT_FOUND'、'VALIDATION_FAILED' */
  code: string;
  /** 用户可读的错误消息 */
  message: string;
  /** 字段级校验错误（ZodError 映射），key 为字段名 */
  details?: Record<string, string[]>;
}

export type ApiEnvelope<T> = { success: true; data: T; error: null; meta?: PageMeta } | { success: false; data: null; error: ApiError; meta?: PageMeta };
```

**实现要点**：

- 业务层抛 `BizException({ code, message, details? })`（`@starter/server-core`），`AllExceptionsFilter` 统一映射为 HTTP 400 + envelope。
- Zod 校验失败 → 422 + `details`（字段级错误数组）。
- 未知异常 → 500 + `INTERNAL_SERVER_ERROR`，不泄露内部细节。

```ts
// 业务层用法（apps/server/src/modules/auth/auth.service.ts 示例）
throw new BizException({
  code: INVALID_CREDENTIALS,
  message: '用户名或密码错误',
  details: { remainingAttempts: [String(remaining)] },
});
```

### 2.3 HTTP 状态码约定

| 状态码 | 场景                                                    |
| ------ | ------------------------------------------------------- |
| 200    | 成功（查询/更新/删除）                                  |
| 201    | 创建成功（如账户创建）                                  |
| 400    | 业务失败（BizException，envelope 内 code 区分具体原因） |
| 401    | 未认证/Token 无效/已撤销                                |
| 403    | 权限不足（PermissionGuard）                             |
| 404    | 资源不存在                                              |
| 409    | 冲突（如唯一约束）                                      |
| 422    | zod 校验失败（字段级 details）                          |
| 429    | 限流触发（@nestjs/throttler）                           |
| 500    | 未预期异常                                              |

## 3. GraphQL 约定

### 3.1 错误映射（统一结构）

所有错误归一化为：

```json
{
  "errors": [
    {
      "message": "用户名或密码错误",
      "extensions": { "code": "INVALID_CREDENTIALS", "fields": null }
    }
  ]
}
```

- `extensions.code`：业务错误码（BizException 的 code；缺省 `INTERNAL_SERVER_ERROR`）。
- `extensions.fields`：字段级校验错误（ZodArgsPipe 产生；无则 `null`）。

### 3.2 命名

- Query/Mutation 驼峰动词开头：`me`、`adminAccounts`、`createRole`、`updateMenu`。
- 类型名与 Prisma 模型对应（`AdminAccount`、`AdminRole`）。
- 输入类型以 `Input` 结尾（`AdminAccountQueryInput`），用 zod schema 生成。

### 3.3 分页（GraphQL 同样适用）

分页入参统一 `page` + `pageSize`（schema 校验上限），返回 `items` + `meta`：

```graphql
query {
  adminAccounts(input: { page: 1, pageSize: 20 }) {
    items {
      id
      username
      enabled
    }
    meta {
      page
      pageSize
      total
    }
  }
}
```

## 4. 错误码规范

### 4.1 命名

- 全大写 `SCREAMING_SNAKE_CASE`，语义化：`INVALID_CREDENTIALS`、`ACCOUNT_LOCKED`、`CACHE_PATTERN_UNSAFE`。
- 表达"是什么错了"，不带 HTTP 语义（状态码由过滤器决定）。

### 4.2 常见错误码清单

| 错误码                                         | 含义                                                | 来源         |
| ---------------------------------------------- | --------------------------------------------------- | ------------ |
| `INVALID_CREDENTIALS`                          | 用户名或密码错误（账号不存在/密码错误同码，防枚举） | auth         |
| `ACCOUNT_DISABLED`                             | 账号已禁用                                          | auth         |
| `ACCOUNT_LOCKED`                               | 登录失败次数过多已锁定                              | auth         |
| `ACCOUNT_NOT_FOUND`                            | 账户不存在                                          | auth/account |
| `VALIDATION_FAILED`                            | zod 校验失败（422，带 details）                     | 全局         |
| `CACHE_PATTERN_EMPTY` / `CACHE_PATTERN_UNSAFE` | 缓存 key 模式非法                                   | cache-admin  |
| `INTERNAL_SERVER_ERROR`                        | 未预期异常                                          | 兜底         |

> 新增错误码时：在 `contracts`（如有枚举）与使用处同时维护，并补充到本清单。

## 5. 命名规范

### 5.1 URL

- 小写 + 连字符（`/api/auth/login`、`/api/upload`）。
- 资源名复数：`/api/admin-accounts`。
- 路径参数：`/api/admin-accounts/:id`。

### 5.2 DTO / 类型

- 输入：`XxxInput` / `XxxCreateInput` / `XxxUpdateInput`。
- 查询参数：`XxxQueryInput`。
- 输出：`XxxVo`（后端）/ 契约类型（前端）。
- 定义位置：`@starter/contracts`（zod schema 兼作类型）。

### 5.3 数据库列

- 表名 snake_case（`@@map` 映射），列名 snake_case（`@map` 映射）；Prisma 字段名 camelCase。

## 6. 分页约定

```ts
// @starter/contracts → pagination.ts（示意）
export interface PageMeta {
  page: number; // 当前页（1 起）
  pageSize: number; // 每页条数
  total: number; // 总条数
}
```

- 入参 `page`（默认 1）/ `pageSize`（默认 20，上限由 zod schema 限制）。
- 返回 `{ items, meta }`。
- 软删除模型默认过滤 `deletedAt: null`（除非显式 `includeDeleted`）。

## 7. 通用建议

1. **查询用 GraphQL，写操作用两端均可**——但同一业务逻辑只写一份 Service。
2. **不要在前端拼 SQL/过滤逻辑**——分页、过滤在后端完成，前端只传参数。
3. **所有新端点必须写 Swagger 注解**（REST）——`openapi/openapi.json` 是 orval client 的输入，漏注解 = 前端拿不到类型。
4. **敏感信息（密码哈希、token）永不进响应**——DTO 白名单输出。
