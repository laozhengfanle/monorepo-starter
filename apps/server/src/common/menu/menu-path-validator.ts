/**
 * 菜单 path 白名单校验器
 *
 * 背景：
 * - 菜单 path 在前端会被用作 router path（vben/naive-ui 的菜单渲染）
 * - 攻击场景：管理员（或拿到管理员权限的攻击者）通过后台把菜单 path 设为
 *   `javascript:alert(1)`、`//evil.com/path`、`/path/../escape` 等
 *   → 前端 router.push() 时可能执行 XSS / CSRF 跳转 / 路径穿越
 * - 解决方案：服务端用白名单正则严格限制 path 字符集
 *
 * 规则（按优先级匹配，任一命中即拒绝）：
 * 1. 必须是 string 类型（其他类型直接拒绝）
 * 2. 非空字符串
 * 3. 必须以 `/` 开头（绝对路径）
 * 4. 字符集：仅允许 `a-z` / `0-9` / `-` / `/`（小写字母 + 数字 + 短横 + 斜杠）
 * 5. 不允许 `//`（双斜杠 → 协议相对 URL `//evil.com`）
 * 6. 不允许 `..`（路径穿越）
 * 7. 不允许 `:` 字符（防 `javascript:` / `data:` / `file:` 等伪协议）
 *
 * 返回值：
 * - 合法：{ ok: true }
 * - 非法：{ ok: false, reason: string }（reason 面向开发者，前端可展示给管理员）
 *
 * 不在这里做"菜单 path 唯一性"检查（DB 层 unique 约束处理）
 */

/** 合法 path 的字符集正则：以 `/` 开头 + 至少 1 个字符 + 后续仅允许 [a-z0-9-/] */
const PATH_PATTERN = /^\/[a-z0-9][a-z0-9-/]*$/;

/**
 * 校验菜单 path 是否合法
 * @param path 待校验的 path 字符串
 * @returns { ok: true } | { ok: false, reason: string }
 */
export function validateMenuPath(path: unknown): { ok: true } | { ok: false; reason: string } {
    // 类型检查：只接受 string
    if (typeof path !== 'string') {
        return { ok: false, reason: 'path 必须是字符串' };
    }

    // 空字符串
    if (path.length === 0) {
        return { ok: false, reason: 'path 不能为空' };
    }

    // 必须以 `/` 开头（绝对路径，避免 `javascript:` / `data:` 等伪协议）
    if (!path.startsWith('/')) {
        return { ok: false, reason: 'path 必须以 / 开头' };
    }

    // 根路径特例：`/` 单独合法（菜单管理中根菜单常见）
    if (path === '/') {
        return { ok: true };
    }

    // 字符集白名单：小写字母 + 数字 + 短横 + 斜杠
    if (!PATH_PATTERN.test(path)) {
        return {
            ok: false,
            reason: 'path 只能包含小写字母、数字、-、/，且首字符之后不能含大写字母或特殊字符',
        };
    }

    // 拒绝 `//`（双斜杠 → 协议相对 URL，攻击者可借此指向 `//evil.com`）
    if (path.includes('//')) {
        return { ok: false, reason: 'path 不能包含连续的 //' };
    }

    // 拒绝 `..`（路径穿越，即使白名单字符集已过滤，此处双保险）
    if (path.includes('..')) {
        return { ok: false, reason: 'path 不能包含 ..（路径穿越）' };
    }

    // 拒绝 `:`（伪协议防护，虽然白名单已过滤大小写仍显式检查）
    if (path.includes(':')) {
        return { ok: false, reason: 'path 不能包含 :（防伪协议）' };
    }

    return { ok: true };
}

/**
 * Zod refine 工厂：供前端表单复用同一套白名单规则
 * - 用 z.string().refine() 在表单层做客户端预校验
 * - 与后端 validator 保持同一套规则（错误消息一致）
 */
export const menuPathZodRefine =
    (msg: string = '菜单 path 非法') =>
    (val: unknown) => {
        const result = validateMenuPath(val);
        return result.ok || { message: `${msg}: ${result.reason}` };
    };
