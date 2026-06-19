/**
 * 业务错误码常量集中定义
 *
 * 命名规范：
 * - 1xxxx：通用 / 参数 / 系统
 * - 11xxx：账户操作
 * - 12xxx：系统配置 / 文件
 * - 2xxxx：认证 / 鉴权
 * - 3xxxx：验证码 / 短信 / 邮件
 * - 4xxxx：第三方登录（OAuth）
 *
 * 设计原则：
 * - 一个错误码对应一种业务场景，前后端按 code 走分支
 * - 错误码是稳定 API，不允许随意变更语义
 * - 新增错误码时按现有区间追加，跨区间插值会破坏已对接端
 */

/** 通用错误：1xxxx */
export const ERROR_CODES = {
    // ── 通用 / 参数 / 系统（1xxxx）──
    UNKNOWN_ERROR: 10999,
    INVALID_PARAMS: 10001,
    NOT_FOUND: 10002,
    CONFLICT: 10003,
    PARENT_NOT_FOUND: 10004, // 父菜单不存在
    SELF_PARENT_CONFLICT: 10005, // 不能将父菜单设置为自己的子菜单
    INTERNAL_ERROR: 10999,

    // ── 账户操作（11xxx）──
    OLD_PASSWORD_ERROR: 11002, // 旧密码错误
    SAME_PASSWORD: 11003, // 新密码不能与旧密码相同

    // ── 系统配置 / 文件（12xxx）──
    CONFIG_KEY_EXISTS: 12001, // 配置键已存在
    UNSUPPORTED_FILE_TYPE: 12002, // 不支持的文件类型或格式不正确
    BATCH_MIN_REQUIRED: 12003, // 批量操作至少一条

    // ── 认证 / 鉴权（2xxxx）──
    UNAUTHORIZED: 20001,
    INVALID_CREDENTIALS: 20002,
    INVALID_TOKEN: 20003,
    REFRESH_CONFLICT: 20005, // Token 已被其他会话使用
    TURNSTILE_FAILED: 20007, // 人机验证失败
    FORBIDDEN: 20001,
    LOGIN_LOCKED: 21001,

    // ── 验证码 / 短信（3xxxx）──
    // SMS：30001~30099
    SMS_TOO_FREQUENT: 30001, // 发送间隔过短
    SMS_DAILY_LIMIT: 30002, // 每日发送上限
    SMS_IP_HOURLY_LIMIT: 30003, // IP 每小时上限
    SMS_CODE_EXPIRED: 30004, // 验证码过期
    SMS_CODE_INVALID: 30005, // 验证码错误
    SMS_SEND_FAILED: 30009, // 发送失败可降级
    // 旧版保留
    SMS_RATE_LIMIT_60S: 30006, // 历史：60 秒间隔（已被 SMS_TOO_FREQUENT 取代）
    SMS_DAILY_LIMIT_LEGACY: 30007, // 历史：每日上限（已被 SMS_DAILY_LIMIT 取代）

    // EMAIL：30101~30199
    EMAIL_TOO_FREQUENT: 30101, // 发送间隔过短
    EMAIL_DAILY_LIMIT: 30102, // 每日发送上限
    EMAIL_CODE_EXPIRED: 30104, // 验证码过期
    EMAIL_CODE_INVALID: 30105, // 验证码错误
    EMAIL_SEND_FAILED: 30109, // 发送失败

    // ── 第三方登录 / OAuth（4xxxx）──
    // 40001~40099
    OAUTH_PROVIDER_DISABLED: 40001, // 提供方未启用
    OAUTH_STATE_INVALID: 40002, // state 校验失败（过期/被消费/不存在）
    OAUTH_BIND_CONFLICT: 40003, // 已被其他账号绑定
    OAUTH_ALREADY_BOUND: 40004, // 已绑定当前账号
    OAUTH_LAST_IDENTITY: 40005, // 至少保留一种登录方式
    OAUTH_INVALID_CODE: 40006, // 授权码无效
    OAUTH_USERINFO_FAILED: 40007, // 拉取用户信息失败
    OAUTH_PROVIDER_NOT_FOUND: 40008, // 提供方不存在
    OAUTH_NOT_BOUND: 40009, // 未绑定该提供方
    OAUTH_APPLE_IDENTITY_TOKEN_INVALID: 40010, // Apple identity_token 校验失败
} as const;

/** 错误码取值类型 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
