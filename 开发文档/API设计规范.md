# API 设计规范

> 项目同时使用 REST（认证端点）和 GraphQL（95%+ 数据 CRUD）。本文定义两套协议的统一约定。

## 协议分工

| 协议        | 用途                                                   |   占比   |
| ----------- | ------------------------------------------------------ | :------: |
| **GraphQL** | 数据 CRUD：Query 查询，Mutation 修改                   |   95%+   |
| **REST**    | 认证流程：登录、登出、刷新 token、短信验证码、文件上传 | 少数端点 |

**为什么认证走 REST 而非 GraphQL**：

- 登录是经典 RPC 操作，不适合"查询文档"语义
- 文件上传（`multipart/form-data`）GraphQL 支持弱
- OAuth 回调天然是 REST
- 登录端点不需要 GraphQL 的灵活性，REST 更简单安全

---

## 一、REST API 规范

### URL 设计

```
# 管理端
POST   /admin/auth/login
POST   /admin/auth/logout

# 共享（token 刷新不区分端）
POST   /auth/refresh

# C端
POST   /member/auth/sms/send
POST   /member/auth/sms/login

# 文件上传（通用）
POST   /api/upload/avatar
POST   /api/upload/file

# 健康检查
GET    /health
GET    /health/liveness
GET    /health/readiness

# Prometheus metrics
GET    /metrics
```

### 命名约定

| 规则                                   | 示例                                               |
| -------------------------------------- | -------------------------------------------------- |
| URL 全小写，短横线分隔                 | `/admin/auth/sms/send` 不是 `/admin/auth/SMS/send` |
| 资源用复数名词                         | `/api/users` 不是 `/api/user`                      |
| 动作用 URL 路径表达，不用 query string | `/auth/logout` 不是 `/auth?action=logout`          |
| 版本前缀预留（当前不使用）             | 当前路径不带 `/v1/`，未来需要时再加                |
| 不使用文件扩展名                       | `/auth/login` 不是 `/auth/login.json`              |

### HTTP 方法

| 方法     | 用途               | 示例                               |
| -------- | ------------------ | ---------------------------------- |
| `GET`    | 查询、健康检查     | `GET /health`                      |
| `POST`   | 创建资源、执行操作 | `POST /admin/auth/login`           |
| `PUT`    | 全量更新资源       | `PUT /admin/accounts/:id`          |
| `PATCH`  | 部分更新资源       | `PATCH /admin/accounts/:id/status` |
| `DELETE` | 删除资源           | `DELETE /api/users/:id`            |

数据 CRUD 主要走 GraphQL Mutation。REST 端点（auth、upload、health）根据语义使用对应 HTTP 方法。

### 请求/响应格式

```json
// 成功响应
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbG...",
    "expiresIn": 900
  },
  "message": "ok"
}

// 失败响应
{
  "code": 20003,
  "message": "用户名或密码错误",
  "data": null
}

// 分页响应（如果有 REST 列表端点）
{
  "code": 0,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### 响应头

| Header                  | 场景       | 示例                              |
| ----------------------- | ---------- | --------------------------------- |
| `X-Request-ID`          | 所有响应   | `X-Request-ID: 550e8400-e29b-...` |
| `X-Total-Count`         | 分页列表   | `X-Total-Count: 100`              |
| `X-RateLimit-Remaining` | 限流信息   | `X-RateLimit-Remaining: 95`       |
| `Location`              | 创建资源后 | `Location: /api/users/xxx`        |

### 错误码

所有 REST 错误使用 [错误码.md](./错误码.md) 中定义的统一码表。HTTP status code 与业务错误码解耦：

| HTTP Status | 场景                                   |
| ----------- | -------------------------------------- |
| 200         | 业务成功或业务失败（通过 `code` 区分） |
| 400         | 请求格式错误（Zod 校验失败）           |
| 401         | JWT 过期或无效                         |
| 403         | 权限不足                               |
| 413         | Body 超过 1MB                          |
| 429         | 触发限流                               |
| 500         | 服务端未知错误                         |

---

## 二、GraphQL API 规范

### Code-First 方式

使用 NestJS `@nestjs/graphql` 的 Code-First 方式，TypeScript class 定义 schema，自动生成 `.graphql` 文件。

```ts
// apps/server/src/modules/user/user.resolver.ts
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { User, CreateUserInput, UpdateUserInput } from './user.model';

@Resolver(() => User)
export class UserResolver {
    constructor(private userService: UserService) {}

    @Query(() => User, { nullable: true })
    async user(@Args('id', { type: () => ID }) id: string) {
        return this.userService.findById(id);
    }

    @Query(() => [User])
    async users(
        @Args('page', { nullable: true, defaultValue: 1 }) page: number,
        @Args('pageSize', { nullable: true, defaultValue: 20 }) pageSize: number,
        @Args('filter', { nullable: true }) filter?: UserFilter,
    ) {
        return this.userService.findMany({ page, pageSize, filter });
    }

    @Mutation(() => User)
    async createUser(@Args('input') input: CreateUserInput) {
        return this.userService.create(input);
    }

    @Mutation(() => User)
    async updateUser(@Args('input') input: UpdateUserInput) {
        return this.userService.update(input);
    }
}
```

### Query 命名

| 操作     | 命名               | 示例                      |
| -------- | ------------------ | ------------------------- |
| 获取单个 | `{entity}`         | `user`, `adminRole`       |
| 获取列表 | `{entity}s`        | `users`, `adminRoles`     |
| 搜索     | `search{Entities}` | `searchUsers`             |
| 统计     | `{entity}Count`    | `userCount`, `orderCount` |

### Mutation 命名

| 操作     | 命名                 | 示例                            |
| -------- | -------------------- | ------------------------------- |
| 创建     | `create{Entity}`     | `createUser`, `createAdminRole` |
| 更新     | `update{Entity}`     | `updateUser`                    |
| 删除     | `delete{Entity}`     | `deleteUser`                    |
| 批量操作 | `{action}{Entities}` | `deleteUsers`, `assignRoles`    |
| 状态流转 | `{action}{Entity}`   | `approveOrder`, `disableUser`   |

### 字段命名

- **camelCase**（GraphQL 惯例）：`userId`, `createdAt`, `isActive`
- 数据库 `snake_case`（`user_id`, `created_at`）→ Prisma 自动映射到 camelCase
- ID 类型用 `GraphQLID`（GraphQL 层）或 `String`（UUID 字符串不敏感）

### 分页规范

GraphQL 推荐 **cursor-based 分页**（Relay Connection 规范），但对于本项目的内部场景，offset-based 也足够：

```graphql
# 简单 offset 分页（本项目推荐，足够用）
type Query {
    users(page: Int = 1, pageSize: Int = 20, filter: UserFilter): UserPage!
}

type UserPage {
    items: [User!]!
    total: Int!
    page: Int!
    pageSize: Int!
    hasMore: Boolean!
}
```

```graphql
# 如需 cursor 分页（高并发场景）
type Query {
    users(first: Int = 20, after: String, filter: UserFilter): UserConnection!
}

type UserConnection {
    edges: [UserEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
}
```

### 筛选规范

```graphql
input UserFilter {
    keyword: String # 模糊搜索（姓名、手机号）
    userType: UserType # 精确匹配
    status: AccountStatus # 精确匹配
    createdAtFrom: DateTime # 时间范围
    createdAtTo: DateTime
}

enum SortOrder {
    ASC
    DESC
}

input UserSort {
    field: UserSortField!
    order: SortOrder = DESC
}

enum UserSortField {
    createdAt
    updatedAt
    realName
}
```

### 错误处理

GraphQL 错误走 `extensions.code`：

```json
{
    "errors": [
        {
            "message": "创建管理员失败",
            "extensions": {
                "code": "21001",
                "field": "email"
            }
        }
    ]
}
```

对应 [错误码.md](./错误码.md) 的 `21001`（数据创建失败）。

### 内省与调试

生产环境：`introspection: false`，`graphiql: false`，`formatError` 脱敏。详见 [安全防护.md](./安全防护.md#6-graphql-内省控制-字段建议禁用)。

---

## 三、Zod 验证共享

### 前后端共享 Schema

```
packages/shared/src/schemas/
├── common.schema.ts    # 分页、排序等通用 schema
├── auth/
│   ├── admin-auth.schema.ts
│   └── member-auth.schema.ts
├── admin/
│   ├── admin-account.schema.ts
│   └── admin-role.schema.ts
└── member/
    └── member-profile.schema.ts
```

```ts
// packages/shared/src/schemas/admin/admin-account.schema.ts
import { z } from 'zod';

// GraphQL Input 和 REST Body 共用
export const CreateUserSchema = z
    .object({
        email: z.string().email('邮箱格式错误'),
        password: z.string().min(8, '密码至少 8 位'),
        userType: z.enum(['admin', 'member']),
    })
    .strict();

export const UserFilterSchema = z
    .object({
        keyword: z.string().max(100).optional(),
        userType: z.enum(['admin', 'member']).optional(),
        status: z.enum(['active', 'disabled']).optional(),
    })
    .optional();
```

### 后端：ZodValidationPipe

```ts
// ZodArgsPipe 作为 @Args() 的 pipe 参数，与 NestJS GraphQL 集成
@Mutation(() => User)
async createUser(
  @Args('input', { type: () => CreateUserInput }, new ZodArgsPipe(CreateUserSchema))
  input: z.infer<typeof CreateUserSchema>,
) {
  return this.userService.create(input);
}
```

### 前端：同一份 schema 做表单校验

```ts
// apps/admin/src/features/users/CreateUser.vue
import { CreateUserSchema } from '@packages/shared';
import { z } from 'zod';

const formErrors = ref<Record<string, string>>({});

function validate() {
    const result = CreateUserSchema.safeParse(formData.value);
    if (!result.success) {
        formErrors.value = result.error.flatten().fieldErrors;
        return false;
    }
    return true;
}
```

---

## 四、API 版本策略

### 当前策略：不版本化

基座是 0→1 项目，第一版不引入版本号。API 路径不带 `/v1/`。

### 未来版本化时机

当满足以下任一条件时引入版本号：

1. 有外部客户依赖 API（不是自己控制的前端）
2. 需要对已有 API 做不兼容变更
3. 需要同时维护多个大版本

### 版本化方式

| 方式                  | 适用           | 示例                                                                 |
| --------------------- | -------------- | -------------------------------------------------------------------- |
| **URL 前缀**（推荐）  | 大型不兼容变更 | `/v2/api/graphql`                                                    |
| GraphQL `@deprecated` | 单个字段废弃   | `type User { oldField: String @deprecated(reason: "use newField") }` |
| Header                | API 网关层     | `Accept-Version: 2`                                                  |

---

## 五、API 文档（Swagger / GraphQL Schema）

### REST：Swagger

```bash
npm install @nestjs/swagger
```

```ts
// main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
    .setTitle('Mono API')
    .setDescription('企业级基座 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

const document = SwaggerModule.createDocument(app, config);

// 仅非生产环境暴露 Swagger UI
if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, document); // 访问 /api/docs
}
```

### GraphQL：自动 schema 文件

```ts
// graphql.module.ts
GraphQLModule.forRoot({
    autoSchemaFile: join(process.cwd(), 'apps/server/src/schema.gql'),
    sortSchema: true,
});
```

生成的 `schema.gql` 即 API 文档，可用 GraphQL Playground（开发环境）查看。

---

## 六、文件上传

### 协议

文件上传走 REST（`multipart/form-data`），不走 GraphQL。理由见第一节协议分工。

### 安装

```
npm install @nestjs/platform-express
```

Multer 已内置于 `@nestjs/platform-express`，无需额外安装。

### 基础用法：头像上传

```ts
// apps/server/src/upload/upload.controller.ts
import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    Inject,
    ParseFilePipe,
    MaxFileSizeValidator,
    FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { IStorageService } from '../storage/storage.interface';

@Controller('api/upload')
export class UploadController {
    constructor(@Inject('STORAGE_SERVICE') private readonly storage: IStorageService) {}

    @Post('avatar')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(), // 文件只在内存中，经 storage service 处理后即释放
            limits: { fileSize: 2 * 1024 * 1024, files: 1 }, // 2MB
        }),
    )
    async uploadAvatar(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
                    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
                ],
            }),
        )
        file: Express.Multer.File,
    ) {
        // memoryStorage → buffer 直接传给 storage service，不落盘
        const result = await this.storage.save(file.buffer, file.originalname, 'avatars', file.mimetype);
        return {
            code: 0,
            data: { id: result.id, url: result.url, size: result.size },
        };
    }
}
```

### 安全清单

| 措施                    | 实现                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **白名单 MIME**         | `FileTypeValidator` 正则 `/^image\/(jpeg\|png\|webp)$/`                                      |
| **Magic bytes**（可选） | 用 `file-type` 包检测文件头，防止改扩展名绕过                                                |
| **大小限制**            | `limits.fileSize` + `MaxSizeValidator` 双重关卡                                              |
| **UUID 重命名**         | storage service 内部 `crypto.randomUUID()` 生成文件名，防路径遍历                            |
| **存储策略**            | `memoryStorage()` → buffer 直传 storage service（详见 [文件存储方案.md](./文件存储方案.md)） |
| **异常兜底**            | `ParseFilePipe` 抛出 `400`，由全局异常过滤器统一处理                                         |

### 生产环境：Presigned URL（推荐）

头像/文件经 NestJS 服务器中转 → 占用带宽 + 内存。更好的方案：服务端生成一次性上传 URL，客户端直接上传到云存储（S3/MinIO/OSS），零服务器带宽。

```ts
// apps/server/src/upload/upload.controller.ts
@Post('presigned-url')
async getPresignedUrl(@Body() dto: { filename: string; contentType: string }) {
  const result = await this.storage.getPresignedUrl(dto.filename, 'uploads', dto.contentType);
  return { code: 0, data: result };
}
```

前端拿到 `url` 和 `fields` 后直接 `<form>` POST 到云存储，文件不过服务器。

> **选择指引**：小文件（头像等）用 `memoryStorage()` + storage service 中转；大文件用 presigned URL 客户端直传。详见 [文件存储方案.md](./文件存储方案.md)。

---

## 延伸阅读

- [项目总览.md](./项目总览.md) — 完整文档索引
- [错误码.md](./错误码.md) — 统一错误码
