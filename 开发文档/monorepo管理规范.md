# monorepo 管理规范

> pnpm workspace 管理 3 个应用 + 2 个共享包。定义依赖管理、版本策略、新增流程和发版规范。

## 仓库结构

```text
monorepo/
├── apps/
│   ├── admin/       → @apps/admin    (Vue 3 管理后台)
│   ├── server/      → @apps/server   (NestJS API)
│   └── web/         → @apps/web      (Vue 3 C端)
├── packages/
│   ├── config/      → @packages/config    (ESLint 共享配置)
│   └── shared/      → @packages/shared    (共享类型、工具函数、Zod schemas)
├── docs/            → 设计文档（不参与构建）
├── pnpm-workspace.yaml
├── package.json
├── pnpm-lock.yaml
└── .gitignore
```

---

## 一、依赖管理

### workspace 配置

```yaml
# pnpm-workspace.yaml
packages:
    - 'apps/*'
    - 'packages/*'
```

### pnpm Catalogs — 统一版本

catalog 协议从 **pnpm 9.5** 开始支持。配置位置：**`pnpm-workspace.yaml`**（与 `packages:` 字段同级），不在 `package.json` 中。

`package.json` 中通过 `"catalog:"` 协议引用（如 `"zod": "catalog:"`），pnpm 自动解析为 `pnpm-workspace.yaml` 中定义的版本范围。发布时 `catalog:` 会被替换为实际版本号。

```yaml
# pnpm-workspace.yaml
packages:
    - 'apps/*'
    - 'packages/*'

catalog:
    # ⚠️ 以下版本号仅作结构演示，不要直接复制。
    # 实际项目初始化后，应通过 `pnpm add` 命令安装包，版本范围会自动写入本文件。
    # 这里的 `*` 表示"使用最新版本"，仅用于演示 catalog 协议的引用语法。
    # 示例（生产项目替换为 pnpm add 自动生成的真实版本）：
    '@nestjs/common': '*' # 示例：实际为 ^11.x
    '@prisma/client': '*' # 示例：实际为 ^5.x 或 ^6.x
    'zod': '*' # 示例：实际为 ^3.x
    'vue': '*' # 示例：实际为 ^3.x
    'typescript': '*' # 示例：实际为 ^5.x（TypeScript 6.x 尚未发布）
    'vitest': '*' # 示例：实际为 ^2.x 或 ^3.x

catalogMode: strict # 禁止第三方依赖使用 catalog: 外的版本（workspace:* 不受此限制）
```

> **重要**：以上版本号**仅为演示 catalog 协议语法**，不要直接复制到生产项目。
> 实际项目初始化流程：
>
> 1. `pnpm add -Dw <包名>`（根目录，会写入 `pnpm-workspace.yaml` 的 `catalog` 字段）
> 2. `pnpm add <包名>` 在具体的 `apps/*` 或 `packages/*` 目录下安装（会写入 `package.json` 的 `"catalog:"`）
> 3. pnpm 自动选定当前最新稳定版本写入 catalog。**不要手动编写版本号**，避免引入过时/不存在的版本（如不存在的 TypeScript 6.x）。

### 依赖层级规则

```text
┌──────────────────────────────────────────────┐
│  apps/*                                      │
│  可以依赖：packages/*、npm 包                  │
│  不可以：apps/ 之间互引                        │
├──────────────────────────────────────────────┤
│  packages/*                                   │
│  可以依赖：其他 packages/*、npm 包              │
│  不可以：apps/*                                │
├──────────────────────────────────────────────┤
│  根目录                                       │
│  只放 devDependencies（lint、prettier、husky） │
└──────────────────────────────────────────────┘
```

### 内部包引用

```json
// apps/server/package.json
{
    "dependencies": {
        "@packages/shared": "workspace:*", // 内部包用 workspace:*
        "@nestjs/common": "catalog:", // 公共版本用 catalog:
        "zod": "catalog:"
    }
}
```

`workspace:*` — pnpm 自动解析为本地路径。发布到 npm 时自动替换为实际版本号。

### 根 package.json

```json
{
    "name": "monorepo",
    "private": true,
    "packageManager": "pnpm@9.15.0", // catalog 协议需要 pnpm ≥ 9.5
    "scripts": {
        "dev": "pnpm -r --parallel dev",
        "dev:admin": "pnpm --filter @apps/admin dev",
        "dev:server": "pnpm --filter @apps/server dev",
        "dev:web": "pnpm --filter @apps/web dev",
        "build": "pnpm -r build",
        "lint": "pnpm -r lint",
        "typecheck": "pnpm -r typecheck",
        "test": "pnpm -r test",
        "clean": "pnpm -r exec rm -rf dist node_modules"
    },
    "devDependencies": {
        "husky": "^9.1.7",
        "lint-staged": "^17.0.5",
        "prettier": "^3.8.3"
    }
}
```

### 幽灵依赖防护

pnpm 默认严格模式，包只能访问自己 `package.json` 中声明的依赖。不配置 `shamefullyHoist`。

如果某个包使用了未声明的依赖（"幽灵依赖"），pnpm 会报错，在开发时就能发现。

---

## 二、TypeScript 配置

### 根 tsconfig.base.json

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "Bundler",
        "strict": true,
        "noUncheckedIndexedAccess": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true
    }
}
```

### apps/server/tsconfig.json

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./dist",
        "rootDir": "./src",
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true
    },
    "include": ["src"],
    "references": [{ "path": "../../packages/shared" }]
}
```

### tsconfig 规则

| 规则                                           | 说明                                        |
| ---------------------------------------------- | ------------------------------------------- |
| 每个 package/app 有自己的 `tsconfig.json`      | 各自 `outDir`、`rootDir`                    |
| 继承 `tsconfig.base.json`                      | 共享 compilerOptions                        |
| packages 使用 `composite: true` + `references` | 启用 TypeScript Project References 增量构建 |
| CI 中 `vue-tsc --noEmit` / `tsc --noEmit`      | Vite 本身不做类型检查                       |

---

## 三、版本管理（Changesets）

### 安装

```bash
pnpm add -Dw @changesets/cli
pnpm changeset init
```

### 工作流

```bash
# 1. 开发功能后，创建 changeset
pnpm changeset

# 2. 选择受影响的包 → 选版本类型（major/minor/patch）
#    - @apps/server: patch
#    - @packages/shared: minor

# 3. 提交 changeset 文件到 Git

# 4. CI 中 / 手动执行版本升级
pnpm changeset version

# 5. 发布（如果是 npm 包）
pnpm -r build && pnpm changeset publish
```

### 版本策略

| 包类型       | 策略         | 说明                          |
| ------------ | ------------ | ----------------------------- |
| `apps/*`     | 不发布到 npm | `"private": true`，只用于部署 |
| `packages/*` | 独立版本     | 按需发布到内部 registry       |

对于纯基座项目（不发布 npm 包），changesets 主要用来：

- 追踪"改了哪些包"
- 自动生成 CHANGELOG.md
- 未来 fork 的项目可以知道基座各版本变化

---

## 四、新增应用 / 包

### 新增 App

```bash
# 1. 创建目录
mkdir -p apps/new-app/src

# 2. 创建 package.json
# apps/new-app/package.json
{
  "name": "@apps/new-app",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint src/",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "vue": "catalog:",
    "@packages/shared": "workspace:*"
  }
}

# 3. 创建 tsconfig.json（继承 base）

# 4. 根 package.json 添加启动脚本
# "dev:new-app": "pnpm --filter @apps/new-app dev"

# 5. 安装
pnpm install
```

### 新增 Package

```bash
mkdir -p packages/new-pkg/src

# packages/new-pkg/package.json
{
  "name": "@packages/new-pkg",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "tsc --watch",
    "build": "tsc",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}

# packages/new-pkg/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}

# packages/new-pkg/src/index.ts
export function hello() {
  return 'hello from new-pkg';
}
```

### 命名规范

| 包类型 | 命名               | 示例               |
| ------ | ------------------ | ------------------ |
| 应用   | `@apps/{name}`     | `@apps/server`     |
| 共享包 | `@packages/{name}` | `@packages/shared` |

---

## 五、脚本约定

每个 package 统一以下脚本语义：

| 脚本        | 作用                   | 必须 |
| ----------- | ---------------------- | :--: |
| `dev`       | 启动开发服务器         |  ✅  |
| `build`     | 构建产物               |  ✅  |
| `lint`      | 代码检查               |  ✅  |
| `typecheck` | 类型检查（不生成文件） |  ✅  |
| `test`      | 运行测试               |  ✅  |
| `test:e2e`  | E2E 测试（如有）       |  —   |
| `clean`     | 清理构建产物           |  —   |

统一脚本的好处：

- 根目录 `pnpm -r lint` 一键检查所有包
- CI 中 `pnpm -r build`、`pnpm -r typecheck` 用于质量门禁
- 新成员接手任何 package，知道这 5 个命令就能开始开发

---

## 六、Git Hooks

### Husky + lint-staged

```json
// 根 package.json
{
    "lint-staged": {
        "*.ts": ["eslint --fix", "prettier --write"],
        "*.{json,md,yaml}": ["prettier --write"]
    }
}
```

```bash
# .husky/pre-commit
pnpm exec lint-staged
pnpm exec gitleaks detect --source . --verbose  # 密钥扫描
```

### 铁律：禁止跳过 Hook

**永远不要使用 `--no-verify` 提交。**

pre-commit hook 运行 prettier 格式化和 ESLint 校验。如果 hook 报错，说明代码不符合规范，必须修复问题本身，而不是绕过检查。

常见报错及正确处理：

| 报错                                        | 原因                                                        | 正确处理                                                                                |
| ------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ESLint 找不到模块（`ERR_MODULE_NOT_FOUND`） | 根 `package.json` 缺少 `@packages/config` 等 workspace 依赖 | 补上 `"@packages/config": "workspace:*"` 到 `devDependencies`                           |
| `was not found by the project service`      | 文件不在任何 `tsconfig.json` 的 `include` 范围内            | 将文件加入对应 tsconfig 的 `include`，或在 `eslint.config.js` 的 `ignores` 中加入该文件 |
| 格式化差异                                  | 代码风格不对                                                | `prettier --write` 自动修复                                                             |

**提交流程**：

```bash
# 1. 改完代码后，手动检查
pnpm -r lint        # 全仓 lint
pnpm -r typecheck   # 全仓类型检查
pnpm -r test        # 全仓测试

# 2. 以上全部通过后，再 commit
git commit -m "feat: xxx"
```

### commit message 规范

```
type(scope): description

feat(server): add refresh token rotation
fix(admin): correct permission check for super admin
docs(security): add prototype pollution defense
chore(deps): bump prisma to 7.0.0
```

| type       | 说明               |
| ---------- | ------------------ |
| `feat`     | 新功能             |
| `fix`      | 修复 bug           |
| `docs`     | 文档变更           |
| `chore`    | 构建/工具/依赖     |
| `refactor` | 重构（不改变行为） |
| `test`     | 测试变更           |
| `security` | 安全相关           |

---

## 七、CI 中的 monorepo 优化

### 增量构建（只处理变更影响的包）

```bash
# 只构建相对于 main 变更的包及其依赖
pnpm --filter '...[origin/main]' build

# 只测试变更影响的包
pnpm --filter '...[origin/main]' test
```

### pnpm store 缓存

```yaml
# .github/workflows/ci.yml
- uses: pnpm/action-setup@v4
  with:
      version: latest

- uses: actions/setup-node@v4
  with:
      node-version: 22
      cache: 'pnpm'

- run: pnpm install --frozen-lockfile
```

---

## 八、package.json 规范清单

每个 `package.json` 检查：

| 检查项                      | 说明                                  |
| --------------------------- | ------------------------------------- |
| ✅ `private: true`          | apps 必须设置，防止误发布到 npm       |
| ✅ `name` 带 scope          | `@apps/server`、`@packages/shared`    |
| ✅ 内部依赖用 `workspace:*` | 不是 `file:../shared`                 |
| ✅ 脚本约定                 | dev / build / lint / typecheck / test |
| ✅ `exports` 字段           | packages 必须定义 public API          |
| ✅ `files` 字段             | packages 只发布 `dist`                |
| ✅ 不写死版本号             | 用 `catalog:` 引用公共版本            |

---

## 延伸阅读

- [项目总览.md](./项目总览.md) — 完整文档索引
- [部署运维.md](./部署运维.md) — CI/CD 配置、Docker 构建
- [前端开发规范.md](./前端开发规范.md) — 脚本约定在前端的具体应用
