# Storybook 使用指南

> 管理后台和 C 端的共享组件库文档站

## 是什么

Storybook 是一个独立运行的组件预览/文档站，开发者可以在不启动主应用的情况下浏览、交互、测试组件库中的所有组件。

## 启动

```bash
# 在 monorepo 根目录
pnpm storybook
```

启动后访问 `http://localhost:6006` 即可。

## 目录结构

```
.storybook/
├── main.ts       # Storybook 主配置：stories 路径、addon 注册、框架
└── preview.ts    # 全局预览配置：背景、装饰器、Pinia/I18n 注入

apps/admin/src/stories/    # admin 端 stories
├── Button.stories.ts
├── Input.stories.ts
├── Dialog.stories.ts
├── EmptyState.stories.ts
└── Skeleton.stories.ts

apps/web/src/stories/      # web 端 stories
├── Button.stories.ts
├── Input.stories.ts
├── Dialog.stories.ts
├── EmptyState.stories.ts
└── Skeleton.stories.ts
```

## 已实现的故事

### Admin (5 个)

| 组件         | Stories 数 | 内容                                             |
| ------------ | ---------- | ------------------------------------------------ |
| `Button`     | 4          | Basic / AllTypes / Sizes / Loading               |
| `Input`      | 4          | Basic / Types / Disabled / RoundAndClearable     |
| `Dialog`     | 4          | Confirm / Info / Success / Error                 |
| `EmptyState` | 4          | Basic / WithAction / NoPermission / NetworkError |
| `Skeleton`   | 4          | Basic / WithAvatar / ManyRows / AvatarOnly       |

### Web (5 个)

| 组件         | Stories 数 | 内容                                                    |
| ------------ | ---------- | ------------------------------------------------------- |
| `Button`     | 4          | Basic / AllTypes / Sizes / Round                        |
| `Input`      | 4          | Basic / LoginForm / SearchBox / CommentBox              |
| `Dialog`     | 4          | UpgradeConfirm / LogoutConfirm / Success / NetworkError |
| `EmptyState` | 4          | Basic / NoSearchResult / VipRequired / EmptyCart        |
| `Skeleton`   | 4          | Basic / ArticleDetail / UserCard / ProductList          |

## 如何新增一个 story

### 1. 创建 stories 文件

在 `apps/admin/src/stories/` 或 `apps/web/src/stories/` 下创建 `<ComponentName>.stories.ts`：

```ts
import type { Meta, StoryObj } from '@storybook/vue3';
import MyComponent from '../components/MyComponent.vue';

const meta: Meta<typeof MyComponent> = {
    title: 'Admin/MyComponent', // Admin 或 Web
    component: MyComponent,
    tags: ['autodocs'], // 自动生成文档
    argTypes: {
        // 定义 props 的控件类型
        size: { control: { type: 'select' }, options: ['small', 'medium', 'large'] },
    },
    args: {
        // 默认 props 值
        size: 'medium',
    },
};

export default meta;
type Story = StoryObj<typeof MyComponent>;

export const Basic: Story = {
    // 使用默认 args
};

export const Custom: Story = {
    args: {
        size: 'large',
    },
};
```

### 2. 重新启动 storybook

```bash
# 杀掉现有进程（如果还在跑）
pkill -f "storybook dev"

# 重启
pnpm storybook
```

## 集成 Pinia

`.storybook/preview.ts` 中已经通过全局装饰器注入了 Pinia，所以 stories 中可以直接使用 store。

## 限制

- 当前配置基于 Storybook 8.x + Vue 3 + Vite
- 不覆盖 monorepo 现有的 Vite 配置（通过 `@storybook/vue3-vite` 框架处理）
- 不自动生成 MDX 文档（需要时手动加 `*.mdx` 文件）
