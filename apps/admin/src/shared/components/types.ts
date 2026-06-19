/**
 * 通用组件类型定义
 *
 * 此文件收纳跨页面、跨特性复用的纯前端组件相关类型（UI 状态枚举、props 接口等）。
 * 业务领域类型（如 MenuNode、AccountRow）应放在对应的 features 子目录里，不要混入这里。
 */

/**
 * 列表显示模式 — 决定列表查询时是否带「已删除」记录
 *
 * 与后端 GraphQL `includeDeleted: Boolean = false` 入参严格对齐：
 *   - 'active'  →  includeDeleted: false  →  只看正常（未删除）记录
 *   - 'deleted' →  includeDeleted: true   →  配合 deletedAt IS NOT NULL 由前端再过滤，或由后端过滤
 *   - 'all'     →  includeDeleted: true   →  一次性看全量（含已删除）
 *
 * 用法：
 *   const displayMode = ref<DisplayMode>('active');
 *   const includeDeleted = computed(() => displayMode.value !== 'active');
 */
export type DisplayMode = 'active' | 'deleted' | 'all';
