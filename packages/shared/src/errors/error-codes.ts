/**
 * 错误码字典
 *
 * 统一前后端错误码定义。前端 graphql-client / fetch 包装用此字典替代硬编码错误信息。
 *
 * 编码规则（与后端 apps/server/src/common/errors/error-codes.ts 对齐）：
 *   - 10xxx: 通用 / 参数 / 系统
 *   - 11xxx: 账户操作（旧密码等）
 *   - 12xxx: 系统配置 / 文件
 *   - 2xxxx: 认证 / 鉴权
 *   - 21xxx: 用户管理
 *   - 22xxx: 角色 / 权限
 *   - 30xxx: 短信服务
 *   - 301xx: 邮件服务
 *   - 40xxx: OAuth 第三方登录
 *   - 10099: 兜底通用错误（BusinessException fallback）
 *   - 10999: 服务器内部错误（AllExceptionsFilter 兜底）
 *
 * 新增错误码时必须同步：
 *   1. 在后端 apps/server/src/common/errors/error-codes.ts 添加
 *   2. 在本文件 ERROR_CODES 同步添加
 *   3. 跑前后端一致性测试（packages/shared/src/errors/__tests__/error-codes.spec.ts）
 *
 * ⚠️ 注意：本文件只能"新增"code 字段，不允许重命名或删除现有 code。
 *    任何破坏性变更会破坏线上用户已经收到的错误提示（虽然 message 字段允许优化）。
 */
import type { ErrorCodeInfo } from '../types/error.js';

/**
 * 错误码 → 错误信息映射
 * 字段：
 *   - code: 数字码
 *   - message: 兜底中文消息（前端可覆盖，i18n 优先）
 *   - category: 大类（通用/认证/业务/系统）
 *   - description: 详细说明（给开发者/日志看，不展示给最终用户）
 */
export const ERROR_CODES = {
    // ── 1xxxx: 通用类 ──
    10001: {
        code: 10001,
        message: '请求参数无效',
        category: 'validation',
        description: 'Zod schema 校验失败 / 必填字段缺失 / 字段类型错误',
    },
    10002: {
        code: 10002,
        message: '资源不存在',
        category: 'not-found',
        description: '请求的资源（用户/订单/菜单等）不存在或已删除',
    },
    10003: {
        code: 10003,
        message: '资源冲突',
        category: 'conflict',
        description: '唯一索引冲突 / 重复提交',
    },
    10004: {
        code: 10004,
        message: '父菜单不存在',
        category: 'validation',
        description: '创建/更新菜单时指定的 parent 菜单不存在',
    },
    10005: {
        code: 10005,
        message: '不能将父菜单设置为自己的子菜单',
        category: 'validation',
        description: '更新菜单时不允许将 parent 设为自身',
    },

    // ── 10xxx: 认证 / 授权 ──
    10099: {
        code: 10099,
        message: '操作失败',
        category: 'common',
        description: '通用兜底错误（BusinessException 抛出且未指定 code）',
    },
    10999: {
        code: 10999,
        message: '服务器内部错误',
        category: 'system',
        description: '未捕获异常 / 数据库错误 / 第三方服务失败（AllExceptionsFilter 兜底）',
    },

    // ── 11xxx: 账户操作 ──
    11002: {
        code: 11002,
        message: '旧密码错误',
        category: 'auth',
        description: '修改密码时旧密码验证失败',
    },
    11003: {
        code: 11003,
        message: '新密码不能与旧密码相同',
        category: 'auth',
        description: '修改密码时新密码与旧密码一致',
    },

    // ── 12xxx: 系统配置 / 文件 ──
    12001: {
        code: 12001,
        message: '配置键已存在',
        category: 'validation',
        description: '系统配置 key 已被占用',
    },
    12002: {
        code: 12002,
        message: '不支持的文件类型或格式不正确',
        category: 'validation',
        description: '文件类型不被允许 / 内容与声明类型不匹配 / 配置 value 格式错误',
    },
    12003: {
        code: 12003,
        message: '操作至少需要一条记录',
        category: 'validation',
        description: '批量操作时列表为空',
    },

    // ── 2xxxx: 认证/授权 ──
    20001: {
        code: 20001,
        message: '未认证 / 无权限访问',
        category: 'auth',
        description: '未登录或当前用户无权限访问该资源（和 FORBIDDEN 共用 20001）',
    },
    20002: {
        code: 20002,
        message: '用户名或密码错误',
        category: 'auth',
        description: '登录失败：账号不存在 / 密码不匹配',
    },
    20003: {
        code: 20003,
        message: 'Token 无效或已过期',
        category: 'auth',
        description: 'JWT 校验失败 / 过期 / 被吊销',
    },
    20005: {
        code: 20005,
        message: 'Token 已被其他会话使用，请重新登录',
        category: 'auth',
        description: 'Refresh token 重放检测：其他会话已刷新过 token',
    },
    20007: {
        code: 20007,
        message: '人机验证失败',
        category: 'auth',
        description: 'Cloudflare Turnstile 校验未通过 / token 无效 / 已过期',
    },

    // ── 21xxx: 用户管理 ──
    21001: {
        code: 21001,
        message: '账号已锁定',
        category: 'user',
        description: '登录失败次数过多导致账号锁定 / 账号被管理员禁用',
    },
    21002: {
        code: 21002,
        message: '邮箱已被注册',
        category: 'user',
        description: 'Member 邮箱冲突',
    },
    21003: {
        code: 21003,
        message: '手机号已被注册',
        category: 'user',
        description: 'Member 手机号冲突',
    },

    // ── 22xxx: 角色 / 权限 ──
    22001: {
        code: 22001,
        message: '角色不存在',
        category: 'permission',
        description: 'Role.id 不存在',
    },
    22002: {
        code: 22002,
        message: '权限不足',
        category: 'permission',
        description: '当前用户角色不具备访问该资源的权限（RBAC 拒绝）',
    },
} as const satisfies Record<number, ErrorCodeInfo>;

/** 错误码联合类型 */
export type ErrorCode = keyof typeof ERROR_CODES;

/** 错误码元信息数组（用于遍历校验、UI 下拉等） */
export const ERROR_CODE_INFO: readonly ErrorCodeInfo[] = Object.values(ERROR_CODES);

/**
 * 工具函数：通过数字 code 查错误信息
 * @param code 错误码
 * @returns 错误信息对象，未找到时返回 null（让调用方决定兜底）
 */
export function getErrorCodeInfo(code: number | string | null | undefined): ErrorCodeInfo | null {
    if (code === null || code === undefined) return null;
    const numCode = typeof code === 'string' ? Number.parseInt(code, 10) : code;
    if (Number.isNaN(numCode)) return null;
    return (ERROR_CODES as Record<number, ErrorCodeInfo>)[numCode] ?? null;
}
