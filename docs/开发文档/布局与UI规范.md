# 布局与 UI 规范

> 页面布局与组件使用的最佳实践。统一规则，减少决策成本。

---

## 一、优先使用 Naive UI + Tailwind，少用原生 HTML

布局和样式优先用 Naive UI 组件 + Tailwind utility classes 实现，不要用原生 HTML 标签（`<div>`、`<span>`、`<p>` 等）手搓布局，除非前者无法实现或实现起来反而更复杂。

能用 Naive UI 原生组件做的，就尽量不要手搓。举例：

- 布局 → `<n-grid>` + `<n-gi>`，而非 CSS grid
- 表单提示 → `feedback` 属性，而非 `<template #feedback><span>...</span></template>`
- 动态提示 → 绑定 `:feedback="variable"`，而非用插槽拼接

---

## 二、属性优先，插槽退居

优先用属性实现，属性满足不了时再用 `<template #xxx>` 插槽。减少模板层级。

---

## 三、输入框附加信息分类放置

输入框的附加信息按性质分类，放在不同位置：

- **单位类**（位、次、分钟、毫秒）→ `<template #suffix>` 放输入框内
- **说明类**（6-32、超过后锁定账号）→ `feedback` 属性

---

## 四、减少嵌套层级

能少层级完成的布局，就不要多层级。避免无意义的包裹 `<div>`。

---

## 五、组件圆角和尺寸用默认的

所有组件都不要主动改变它的圆角和尺寸，用默认的就好。不主动加 `rounded-md!`、改 `:size` 等。

---

## 六、页面结构

不同类型的页面有不同的布局模式：

### 6.1 管理页面（CRUD 列表页）

管理员、角色、菜单等标准管理页面，采用「卡片 + 弹窗」模式：

```vue
<template>
    <!-- 根节点：路由页面可用 Fragment（多根节点），也可用 <div> 包裹 -->
    <n-card title="页面标题">
        <!-- 头部右侧操作按钮 -->
        <template #header-extra>
            <n-button type="primary" @click="openForm()">
                <template #icon
                    ><n-icon><Plus /></n-icon
                ></template>
                添加
            </n-button>
        </template>

        <!-- 筛选区域（见第七节搜索栏规范） -->

        <!-- 数据表格 -->
        <n-data-table ... />
    </n-card>

    <!-- 新增/编辑弹窗 -->
    <n-modal v-model:show="isFormModalVisible" preset="card" :title="isEdit ? '编辑' : '新增'" ...>
        <n-form ... />
        <template #footer>取消 / 确认按钮</template>
    </n-modal>
</template>
```

> **关于根节点**：Vue 3 支持多根节点（Fragment），路由页面组件可以直接写多个根节点，不会报错。但如果父组件会透传 `class` / `style` 等 attrs，Vue 无法自动继承到多根节点上，此时需要加一个 `<div>` 包裹。

### 6.2 仪表盘页面（Dashboard）

仪表盘、概览等展示型页面，采用「标题独立 + 内容卡片分区」模式：

```vue
<template>
    <n-space vertical :size="gap">
        <!-- 标题区：独立于卡片之外 -->
        <div>
            <h1>页面标题</h1>
            <p class="text-sm text-gray-500">页面副标题说明</p>
        </div>

        <!-- 内容区：按功能分区，每区一个 n-card -->
        <n-card>区域一</n-card>
        <n-card>区域二</n-card>
    </n-space>
</template>
```

---

## 七、搜索栏规范

以管理员管理页为标准：

- **折叠/展开**：筛选项 ≥3 个时，用 `<n-grid :collapsed="isCollapsed" :collapsed-rows="1">` 默认收起，操作列放 `<n-gi suffix>` 插槽，带「展开/收起」按钮
- **响应式断点**：用 `responsive="self"` + 精细断点 `1 640:2 1024:3 1536:4`，不用 `responsive="screen"` + s:m:xl
- **操作列**：查询、重置、展开/收起按钮放在最后一个 `<n-gi suffix>` 中，label 用 `sr-only` 隐藏
- **查询按钮**：加搜索图标 `<template #icon><n-icon><Search /></n-icon></template>`，`type="primary"`
- **重置按钮**：无特殊样式
- **筛选表单**：`label-placement="left"` `label-align="right"`，`:show-feedback="false"` 去掉表单项底部间距
- **分页模式**：数据量大时用 remote 服务端分页，避免全量加载

---

## 八、表单校验规范

### 8.1 校验规则单一数据源

前端 `formRules` 和 `FieldRulePopover` 规则必须从 `@packages/shared` 的 Zod schema 通过 `zodToRules` → `zodToFormRules` / `zodToPopoverRules` 生成，**禁止硬编码**。

```ts
// ✅ 正确 — 从 Zod schema 自动提取规则
import { zodToRules } from '@packages/shared';
import { zodToFormRules, zodToPopoverRules } from '@/utils/zod-form-rules';
import { CreateAdminAccountSchema } from '@packages/shared';

const schemaRules = zodToRules(CreateAdminAccountSchema) as Record<string, FieldRuleSet>;
const formRules = zodToFormRules(schemaRules);
const usernamePopoverRules = zodToPopoverRules(schemaRules.username);

// ❌ 错误 — 硬编码校验规则，与后端 schema 重复且容易不一致
const formRules = {
    username: { required: true, min: 2, max: 20, message: '...' },
};
```

**例外**：密码等动态策略字段可保留自定义逻辑（如从 `configStore` 读取），但其余字段必须走 schema。

### 8.2 必填 `*` 号由 rules 驱动

必填字段的 `*` 号必须由 `formRules` 中的 `required: true` 驱动，**禁止手动设 `:required` prop**。这是 Naive UI 规范——`*` 号跟着 rules 走，不由 prop 控制。

```vue
<!-- ✅ 正确 — required: true 在 rules 中，* 号自动出现 -->
<n-form-item label="用户名" :rule="formRules.username" path="username">
  <n-input v-model:value="form.username" clearable />
</n-form-item>

<!-- ❌ 错误 — 手动 :required prop，不符合 Naive UI 规范 -->
<n-form-item label="用户名" :required="true" :rule="formRules.username" path="username">
  <n-input v-model:value="form.username" clearable />
</n-form-item>
```

**动态必填**（如密码在新增时必填、编辑时选填）：将 `formRules` 改为 `computed`，规则中 `required` 根据模式动态变化。

```ts
const formRules = computed(() => ({
    ...zodToFormRules(schemaRules),
    password: [
        { required: !isEdit.value, message: '请输入密码' },
        // ... 其他密码规则
    ],
}));
```

### 8.3 required + validator 不重复拦截空值

当 `required` 规则和自定义 `validator` 都会拦截空值时，`validator` 中空值必须 `return true`，避免显示两条重复错误信息。空值拦截完全交给 `required` 规则。

```ts
// ✅ 正确 — validator 中空值 return true，让 required 规则统一处理
{
  validator: (_rule, value) => {
    if (!value) return true  // 空值交给 required 规则
    return /[a-zA-Z]/.test(value) && /\d/.test(value)
  },
  message: '密码需包含字母和数字',
}

// ❌ 错误 — validator 也拦截空值，导致两条 "请输入密码"
{
  validator: (_rule, value) => {
    if (!value) return new Error('请输入密码')  // 与 required 规则重复
    return /[a-zA-Z]/.test(value) && /\d/.test(value)
  },
  message: '密码需包含字母和数字',
}
```

---

## 九、表单输入组件规范

### 9.1 表单输入组件默认加 clearable

所有支持 `clearable` 的表单输入组件都应加上，方便用户一键清空。包括但不限于：

- `n-input`（单行文本）
- `n-input type="textarea"`（多行文本）
- `n-select`（下拉选择）

```vue
<!-- ✅ 正确 -->
<n-input v-model:value="form.username" clearable />
<n-input v-model:value="form.remark" type="textarea" clearable />
<n-select v-model:value="form.roleId" :options="roleOptions" clearable />

<!-- ❌ 错误 — 缺少 clearable -->
<n-input v-model:value="form.username" />
<n-select v-model:value="form.roleId" :options="roleOptions" />
```

### 9.2 多规则字段用 FieldRulePopover

多规则字段（如用户名、角色编码、密码）使用 `FieldRulePopover` 组件，在 focus 时弹出规则清单（一条规则一行），带实时状态指示（✓/✗）。单规则/简单字段用 `feedback` 文本提示即可。

---

## 十、FieldRulePopover 规范

### 10.1 禁止用 n-popover 包裹输入框

`n-popover` 包裹输入框会破坏 `n-form-item` 的 flex 布局，导致输入框高度为 0 完全不可见。必须用 **Teleport + fixed 定位** 独立渲染弹窗，输入框触发区域只用简单的 `inline-flex` `div` 包裹。

```vue
<!-- ✅ 正确 — Teleport + fixed 定位，不破坏 form-item 布局 -->
<template>
    <div @focusin="onFocusIn" @focusout="onFocusOut" class="field-rule-trigger" ref="triggerRef">
        <slot />
    </div>
    <Teleport to="body">
        <div v-if="isFocused" class="field-rule-popover" :style="popoverStyle">
            <!-- 规则列表 -->
        </div>
    </Teleport>
</template>

<!-- ❌ 错误 — n-popover 包裹输入框，破坏 n-form-item flex 布局 -->
<n-popover trigger="focus">
  <template #trigger>
    <n-input v-model:value="form.username" />  <!-- 高度变为 0，不可见 -->
  </template>
  <!-- 规则列表 -->
</n-popover>
```

### 10.2 弹窗定位与层级

- 触发区域：`display: inline-flex; width: 100%` 的简单 `div`
- 弹窗定位：`position: fixed; z-index: 3000`（高于 modal 层级）
- 智能定位：右侧空间 ≥ 240px 时在右侧显示，空间不足时切换到下方

---

## 十一、限流时主动清理 Redis

遇到限流（429）时，不要干等冷却，直接用 ioredis 清掉限流 key 后重试。

```ts
// 限流 key 格式参考：mono:rate:{throttlerName}:{ttl}:{key}
await redis.keys('mono:rate:*').then((keys) => {
    if (keys.length) redis.del(...keys);
});
```
