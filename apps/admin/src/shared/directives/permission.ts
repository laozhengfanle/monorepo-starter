/**
 * v-permission 自定义指令
 *
 * 用法：
 *   <n-button v-permission="'iam:admin:delete'">删除</n-button>
 *   <n-button v-permission="['iam:admin:edit', 'iam:admin:delete']">操作</n-button>
 *
 * 无权限 → 直接 remove 元素（不使用 display:none），避免 DOM 残留和 CSS 优先级问题。
 * 权限码来源：usePermissionStore，登录后由 /me 接口填充。
 *
 * 注意：
 *   - remove 后元素不可恢复，权限变更后需组件重新挂载才能生效
 *   - 如需动态权限变更后自动响应，需额外实现 `updated` 钩子
 *     （当前设计：权限变更后页面会刷新路由，组件自然重新挂载，updated 非必需）
 */
import type { Directive } from 'vue';
import { usePermissionStore } from '@/shared/stores/permission';

export const vPermission: Directive<HTMLElement, string | string[]> = {
    mounted(el, binding) {
        const { hasAnyPermission } = usePermissionStore();
        const codes = Array.isArray(binding.value) ? binding.value : [binding.value];
        if (!hasAnyPermission(codes)) {
            el.remove();
        }
    },
};

export default vPermission;
