/**
 * useErrorMessage 测试
 *
 * 覆盖 3 个核心场景（spec 要求）：
 * 1. 已知 code → 返回字典中的中文 message
 * 2. 未知 code → 返回兜底文案
 * 3. 与后端字典一致：与 packages/shared 的 ERROR_CODES 同步校验
 */
import { describe, expect, it } from 'vitest';
import { useErrorMessage, translateErrorCode, ERROR_CODES } from '../useErrorMessage';
import { ERROR_CODES as SHARED_ERROR_CODES } from '@packages/shared';

describe('useErrorMessage - 已知 code 查表', () => {
    it('数字 code 20002 应返回"用户名或密码错误"', () => {
        const { t } = useErrorMessage();
        expect(t(20002)).toBe('用户名或密码错误');
    });

    it('字符串 code "21001" 应返回"账号已锁定"', () => {
        const { t } = useErrorMessage();
        expect(t('21001')).toBe('账号已锁定');
    });

    it('数字 code 22002 应返回"权限不足"', () => {
        const { t } = useErrorMessage();
        expect(t(22002)).toBe('权限不足');
    });

    it('字符串 code "20003" 应返回"Token 无效或已过期"', () => {
        const { t } = useErrorMessage();
        expect(t('20003')).toBe('Token 无效或已过期');
    });
});

describe('useErrorMessage - 未知 code 兜底', () => {
    it('未知 code 应返回默认兜底文案', () => {
        const { t } = useErrorMessage();
        expect(t(99999)).toBe('操作失败，请稍后重试');
    });

    it('未知字符串 code 应返回默认兜底文案', () => {
        const { t } = useErrorMessage();
        expect(t('abc-not-a-code')).toBe('操作失败，请稍后重试');
    });

    it('传入 null / undefined / "" 应返回默认兜底文案', () => {
        const { t } = useErrorMessage();
        expect(t(null)).toBe('操作失败，请稍后重试');
        expect(t(undefined)).toBe('操作失败，请稍后重试');
        expect(t('')).toBe('操作失败，请稍后重试');
    });

    it('传入自定义 fallback 应覆盖默认兜底文案', () => {
        const { t } = useErrorMessage();
        expect(t(99999, '自定义兜底')).toBe('自定义兜底');
        expect(t('unknown', '网络异常')).toBe('网络异常');
    });

    it('已知 code 不应被 fallback 覆盖（fallback 仅用于未知 code）', () => {
        const { t } = useErrorMessage();
        /** 已知 code 20002：字典有值 → 直接用字典，fallback 不生效 */
        expect(t(20002, '不该出现的兜底')).toBe('用户名或密码错误');
    });
});

describe('useErrorMessage - 与后端字典一致性（SSOT 校验）', () => {
    /**
     * 核心约束：
     *   前端的 ERROR_CODES 必须 = 后端 @packages/shared 的 ERROR_CODES
     *   - 任何不一致都会导致前端"code 命中但 message 翻译错误"
     *   - 兜底会兜住，但用户看到的 message 会与后端日志对不上
     *
     * 实现：
     *   - 用 Object.keys 对比 code 集合
     *   - 用 code 逐个对比 message 字段
     *   - 任何不一致 → 抛 fail，让 CI 阻断
     */
    it('前端 ERROR_CODES 与后端 ERROR_CODES 的 code 集合必须一致', () => {
        const frontendCodes = Object.keys(ERROR_CODES).sort();
        const sharedCodes = Object.keys(SHARED_ERROR_CODES).sort();
        expect(frontendCodes).toEqual(sharedCodes);
    });

    it('前端 ERROR_CODES 的 message 字段必须与后端一致', () => {
        for (const code of Object.keys(ERROR_CODES)) {
            const frontendInfo = ERROR_CODES[code as unknown as keyof typeof ERROR_CODES];
            const sharedInfo = SHARED_ERROR_CODES[code as unknown as keyof typeof SHARED_ERROR_CODES];
            /** code 集合一致 → 这里必能找到 sharedInfo，但加防御性比对 */
            expect(sharedInfo).toBeDefined();
            expect(frontendInfo.message).toBe(sharedInfo.message);
            expect(frontendInfo.category).toBe(sharedInfo.category);
        }
    });
});

describe('translateErrorCode 纯函数', () => {
    it('已知 code 应与 useErrorMessage().t(code) 返回一致', () => {
        const { t } = useErrorMessage();
        expect(translateErrorCode(20001)).toBe(t(20001));
        expect(translateErrorCode('21001')).toBe(t('21001'));
    });

    it('未知 code 应返回默认兜底', () => {
        expect(translateErrorCode(99999)).toBe('操作失败，请稍后重试');
        expect(translateErrorCode(99999, '自定义')).toBe('自定义');
    });
});
