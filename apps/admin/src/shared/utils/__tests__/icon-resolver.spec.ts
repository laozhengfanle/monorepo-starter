/**
 * icon-resolver 单元测试
 *
 * 测试覆盖：
 *   - 合法字符串 "tabler:Home" 解析为 Home 组件
 *   - 未知图标返回 null（resolveIcon）/ FallbackIcon（resolveIconOrFallback）
 *   - XSS 防护：恶意字符串（含 <script> / onerror 等）不会执行 JS
 *     → resolveIcon 找不到 → 返回 null
 *     → resolveIconOrFallback 找不到 → 返回 FallbackIcon
 *   - 边界：undefined / 空串 / 缺冒号
 */
import { describe, it, expect } from 'vitest';
import { resolveIcon, resolveIconOrFallback, FallbackIcon } from '../icon-resolver';
import { Home, ShieldLock, QuestionMark } from '@vicons/tabler';

describe('icon-resolver', () => {
    describe('resolveIcon', () => {
        it('合法 "tabler:Home" 返回 Home 组件', () => {
            const icon = resolveIcon('tabler:Home');
            expect(icon).toBe(Home);
        });

        it('合法 "tabler:ShieldLock" 返回 ShieldLock 组件', () => {
            const icon = resolveIcon('tabler:ShieldLock');
            expect(icon).toBe(ShieldLock);
        });

        it('未知图标返回 null', () => {
            expect(resolveIcon('tabler:NotExist')).toBeNull();
            expect(resolveIcon('foo:bar')).toBeNull();
        });

        it('缺冒号返回 null', () => {
            expect(resolveIcon('no-colon-string')).toBeNull();
            expect(resolveIcon('Home')).toBeNull();
        });

        it('undefined / 空串 / 非字符串返回 null', () => {
            expect(resolveIcon(undefined)).toBeNull();
            expect(resolveIcon('')).toBeNull();
            // @ts-expect-error 测试运行时类型防御
            expect(resolveIcon(null)).toBeNull();
            // @ts-expect-error 测试运行时类型防御
            expect(resolveIcon(123)).toBeNull();
        });
    });

    describe('resolveIconOrFallback', () => {
        it('合法 "tabler:Home" 返回 Home 组件', () => {
            const icon = resolveIconOrFallback('tabler:Home');
            expect(icon).toBe(Home);
        });

        it('未知图标返回 FallbackIcon（永不返回 null）', () => {
            expect(resolveIconOrFallback('tabler:NotExist')).toBe(FallbackIcon);
            expect(resolveIconOrFallback('xxx:yyy')).toBe(FallbackIcon);
            expect(resolveIconOrFallback('')).toBe(FallbackIcon);
            expect(resolveIconOrFallback(undefined)).toBe(FallbackIcon);
        });

        it('FallbackIcon 组件渲染 QuestionMark（兜底问号图标）', () => {
            // 验证 FallbackIcon 真的渲染 QuestionMark 组件
            const vnode = FallbackIcon.render!();
            // 渲染函数的返回值是 vnode，type 应该是 QuestionMark
            expect((vnode as { type: unknown }).type).toBe(QuestionMark);
        });
    });

    // ============================================================
    // XSS 防护：恶意字符串验证
    // ============================================================
    describe('XSS 防护', () => {
        // 模拟攻击者上传的 menu.icon 字符串
        const MALICIOUS_INPUTS = [
            '<script>alert("xss")</script>',
            '"><img src=x onerror=alert(1)>',
            'javascript:alert(1)',
            '<iframe src="evil.com"></iframe>',
            'onclick=alert(1)',
            '<svg onload=alert(1)>',
            'data:text/html,<script>alert(1)</script>',
        ];

        it.each(MALICIOUS_INPUTS)('恶意字符串 %s → resolveIcon 返回 null（不执行任何 JS）', (payload) => {
            // resolveIcon 是纯字符串查表，永远不会触发任何 DOM 写入或 JS 执行
            const result = resolveIcon(payload);
            expect(result).toBeNull();
        });

        it.each(MALICIOUS_INPUTS)(
            '恶意字符串 %s → resolveIconOrFallback 返回 FallbackIcon（不执行任何 JS）',
            (payload) => {
                const result = resolveIconOrFallback(payload);
                // 关键：结果必须是 Vue 组件（Component），不是 HTML 字符串
                // 即使用恶意字符串当 :is 参数，Vue 只会查表，找不到走 fallback
                expect(result).toBe(FallbackIcon);
            },
        );
    });
});
