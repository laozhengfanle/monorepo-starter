# TypeDoc API 文档

> 本文档介绍如何使用 TypeDoc 自动生成 monorepo 项目的 API 文档。

## 概述

TypeDoc 从 TypeScript 源码的 JSDoc 注释 + 类型声明自动生成可浏览的 HTML API 文档，输出到 `docs/api/` 目录。

**与 Swagger UI 的区别**：

- **Swagger UI**（`/api/docs`）：运行时 API 文档，关注 HTTP 端点、请求/响应 schema、鉴权
- **TypeDoc**（`docs/api/`）：源码 API 文档，关注类、函数、类型定义、设计约定

两者互补，覆盖"运行时契约"和"源码实现"两个层次。

## 快速开始

```bash
# 生成 API 文档到 docs/api/ 目录
pnpm exec typedoc --skipErrorChecking --out docs/api --entryPointStrategy expand packages/shared/src/index.ts apps/server/src/main.ts

# 浏览器打开 docs/api/index.html
open docs/api/index.html
```

## 包含范围

TypeDoc 当前扫描以下入口：

| 入口                           | 说明                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `packages/shared/src/index.ts` | 共享包导出（schemas、错误码字典、i18n 配置、工具类型） |
| `apps/server/src/main.ts`      | 后端启动入口 + 核心配置                                |

TypeDoc 启动后通过 `--entryPointStrategy expand` 自动递归展开所有被引用的模块，无需手动列文件。

## 输出结构

```
docs/api/
├── index.html                # 首页
├── classes/                  # 类
├── interfaces/               # 接口
├── functions/                # 函数
├── types/                    # 类型别名
├── modules/                  # 模块
└── assets/                   # 静态资源（CSS、JS、search index）
```

> `docs/api/` 已加入 `.gitignore`，不提交到 git。

## JSDoc 注释规范

为了让 TypeDoc 输出有意义的文档，所有 **核心 API 入口**（挂了 `@Public()` / `@Query()` / `@Mutation()` 装饰器的方法）必须写 JSDoc。

### 模板

```ts
/**
 * @description 业务说明
 * @param accountId - 账号 ID
 * @returns 账号详情
 * @throws NotFoundException 账号不存在
 * @example await service.findById('xxx')
 */
@Public()
@Post('account/:id')
async findById(@Param('id') accountId: string) {
    return this.service.findById(accountId);
}
```

### 支持的标签

| 标签            | 用途                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `@description`  | 方法用途说明                                                                  |
| `@param <name>` | 参数说明（多个参数重复）                                                      |
| `@returns`      | 返回值说明                                                                    |
| `@throws`       | 可能抛出的异常                                                                |
| `@example`      | 使用示例                                                                      |
| `@remarks`      | 补充说明（与 description 区别：description 给"是什么"，remarks 给"注意什么"） |
| `@see`          | 相关引用链接                                                                  |

> 中文注释 OK，TypeDoc 原样保留。Spec 明确"用户是新手，所有代码写中文注释"。

## 覆盖率检查

JSDoc 覆盖率由 `scripts/jsdoc-coverage.mjs` 扫描（`apps/server/src` 内 @Public / @Query / @Mutation 装饰器的方法）：

```bash
node scripts/jsdoc-coverage.mjs
```

输出示例：

```
📊 JSDoc 覆盖率检查
   扫描目录：apps/server/src
   扫描文件：120 个
   目标方法：30 个（@Public / @Query / @Mutation）
   已注释：  18 个
   覆盖率：  60.0%（阈值：60%）

✅ 覆盖率达标
```

- **阈值 60%**（spec 明确"不要 80%，避免过度"）
- 只扫描"外部可调用"的契约层（@Public / @Query / @Mutation）
- 内部 service / helper 不强制（避免过度文档化）

> 注意：当前 CI 未接入 jsdoc 覆盖率门禁，由 PR review 人工把关。

## 故障排查

### Q1：TypeDoc 运行后 `docs/api/` 是空的

**原因**：TypeDoc 找不到任何被导出的类型。检查入口文件是否用 `export` 导出目标类 / 接口 / 函数。

### Q2：TypeDoc 报错 `Cannot find module 'xxx'`

**原因**：源码中 import 的路径在当前 cwd 解析不到。TypeDoc 在根目录运行，确保 `tsconfig.json` 的 paths 配置正确。

### Q3：生成的 HTML 找不到样式

**原因**：直接双击打开 `docs/api/index.html`，浏览器拒绝从 `file://` 加载本地资源。**必须用 HTTP 服务器**：

```bash
# 在 docs/api 目录起一个临时 HTTP 服务
npx http-server docs/api -p 8080
# 然后浏览器访问 http://localhost:8080
```

或：

```bash
python3 -m http.server 8080 -d docs/api
```

## 进一步阅读

- [TypeDoc 官方文档](https://typedoc.org/)
- [项目总览.md](./项目总览.md)
- [API设计规范.md](./API设计规范.md)
- [安全防护.md](./安全防护.md) — 关于 API 安全的细节
