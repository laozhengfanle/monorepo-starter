/**
 * Redis 缓存 Key 集中定义
 * - 命名规范：mono:{domain}:{entity}[:{identifier}]
 * - 所有模块统一引用此处常量，避免散落硬编码字符串
 * - 集中在文件顶部便于 review + 全文搜索
 * - 前缀 mono: 避免与其他系统 Redis 库冲突
 *
 * 注意：
 * - 不要把含业务参数（如 accountId）的完整 Key 写在这里
 * - 含参 Key 在使用处用 `${CACHE_KEYS.AUTH_RESULT}:${accountId}` 拼接
 * - 这里的常量是"前缀"，不是最终 key
 */

/**
 * 账户认证缓存前缀：mono:auth:{accountId}
 * - 存储账户的角色编码列表 + 权限码列表 + 菜单树
 * - TTL 30 分钟（防雪崩时可缩短）
 */
export const AUTH_RESULT = 'mono:auth';

/**
 * 角色权限码缓存前缀：mono:role:permission:{userType}:{roleCode}
 * - 角色级 L1 缓存：聚合后的权限码集合
 * - TTL 30 分钟
 *
 * 注意：变量名 `ROLE_PERM` 是代码内部标识符（含义 = role 维度的 permission 缓存），
 * 但 Redis key 字符串里展开成 `permission` 符合命名规范 §五「禁止缩写」要求。
 * 命名规范只约束 Redis key 字符串里的单词完整性，代码层变量名不在本规则范围。
 */
export const ROLE_PERM = 'mono:role:permission';

/**
 * 角色菜单缓存前缀：mono:role:menus:{userType}:{roleCode}
 * - 角色级 L1 缓存：扁平菜单列表
 * - TTL 30 分钟
 */
export const ROLE_MENUS = 'mono:role:menus';

/**
 * 角色账户映射前缀：mono:role:accounts:{userType}:{roleCode}
 * - 存储持有该角色的账户 ID 列表（用于角色变更时级联失效）
 * - TTL 30 分钟
 */
export const ROLE_ACCOUNTS = 'mono:role:accounts';

/**
 * 系统配置缓存前缀：mono:data:system_config:{key}
 * - 存储 system_config 表的 value 字段
 * - miss 时查 DB 回填
 * - TTL 1 小时
 */
export const SYSTEM_CONFIG = 'mono:data:system_config';

/**
 * 菜单数据版本号：mono:data:menu_version
 * - 整数计数器，每次菜单结构（create/update/delete）变化时 INCR
 * - 嵌入 AuthCacheData 一起缓存（menuVersion 字段），读时与当前值比对
 * - 不一致 → 视为脏数据 → 自动 miss 并重建（懒失效）
 *
 * 为什么需要这个版本号：
 *   - 缓存失效是命令式的（imperative）：写完调 invalidateMenuStructure()
 *   - 但任何「不在白名单里的写路径」（seed / Prisma Studio / 直连 SQL）都不会调
 *   - 30 分钟内任何再次访问都吃旧缓存 → 用户看到「菜单没变」
 *   - 用版本号 + 读时校验实现「声明式失效」：写路径不记得调 invalidate 也无所谓，
 *     下次读时自动发现版本不一致 → 重建
 *   - 详见 docs/缓存设计.md「声明式失效：数据版本号」一节
 */
export const MENU_VERSION = 'mono:data:menu_version';

/**
 * 登录锁定前缀：mono:lock:login:{accountId}
 * - 登录失败计数 + 锁定状态
 * - TTL 15 分钟
 */
export const LOGIN_LOCK = 'mono:lock:login';

/**
 * 文件上传锁前缀：mono:lock:upload:{accountId}
 * - 防止同一账户短时间内重复上传
 * - TTL 1 分钟
 */
export const FILE_UPLOAD = 'mono:lock:upload';

/**
 * 短信验证码前缀：mono:verify:sms:{phone}
 * - 短信验证码缓存
 * - TTL 5 分钟（具体 TTL 由 system_config.sms.provider.limits.codeTtl 控制）
 */
export const SMS_CODE = 'mono:verify:sms';

/**
 * 短信每日发送计数：mono:verify:sms:daily:{phone}
 * - 同一手机号每日发送次数计数
 * - TTL 至当天 24:00
 */
export const SMS_DAILY = 'mono:verify:sms:daily';

/**
 * 短信发送间隔标记：mono:verify:sms:interval:{phone}
 * - 防短信轰炸：60 秒内只能发一次
 * - TTL 60 秒
 */
export const SMS_INTERVAL = 'mono:verify:sms:interval';

/**
 * 短信 IP 每小时计数：mono:verify:sms:ip:{ip}
 * - 同一 IP 每小时发送次数计数
 * - TTL 1 小时
 */
export const SMS_IP_HOURLY = 'mono:verify:sms:ip';

/**
 * 短信验证失败计数：mono:verify:sms:attempts:{phone}
 * - 同一手机号验证失败次数，达到上限后置 expired
 * - TTL 与验证码 TTL 一致
 */
export const SMS_ATTEMPTS = 'mono:verify:sms:attempts';

/**
 * 邮件验证码前缀：mono:verify:email:{email}
 * - 邮件验证码缓存
 * - TTL 30 分钟
 */
export const VERIFY_EMAIL = 'mono:verify:email';

/**
 * 邮件每日发送计数：mono:verify:email:daily:{email}
 * - 同一邮箱每日发送次数计数
 * - TTL 至当天 24:00
 */
export const EMAIL_DAILY = 'mono:verify:email:daily';

/**
 * 邮件发送间隔标记：mono:verify:email:interval:{email}
 * - 防邮件轰炸：60 秒内只能发一次
 * - TTL 60 秒
 */
export const EMAIL_INTERVAL = 'mono:verify:email:interval';

/**
 * 邮件验证失败计数：mono:verify:email:attempts:{email}
 */
export const EMAIL_ATTEMPTS = 'mono:verify:email:attempts';

/**
 * Refresh Token 已使用标记前缀：mono:refresh:used:{accountId}:{tokenHash}
 * - Refresh Token Rotation + Reuse Detection
 * - 标记 token 是否被用过
 * - TTL 与 JWT_REFRESH_TTL 一致
 */
export const REFRESH_USED = 'mono:refresh:used';

/**
 * Refresh Token 家族前缀：mono:refresh:family:{accountId}
 * - 记录最后一次签发的 token hash
 * - logout 时按 pattern 清除该用户所有 token
 * - TTL 与 JWT_REFRESH_TTL 一致
 */
export const REFRESH_FAMILY = 'mono:refresh:family';

/**
 * Turnstile 验证结果前缀：mono:verify:turnstile:{token}
 * - 缓存 Cloudflare Turnstile 验证结果，避免重复调用 API
 * - TTL 10 分钟
 */
export const TURNSTILE_VERIFY = 'mono:verify:turnstile';

/**
 * OAuth State 防 CSRF 前缀：mono:oauth:state:{state}
 * - OAuth 授权流程中的 state 参数，一次性消费
 * - 验证后立即删除
 * - TTL 10 分钟
 */
export const OAUTH_STATE = 'mono:oauth:state';

/**
 * 限流计数器前缀：mono:rate:{tracker}:{throttlerName}
 * - 限流窗口内的请求计数
 * - TTL 为限流窗口大小
 */
export const RATE_LIMIT = 'mono:rate';

/**
 * 敏感缓存 key 前缀（管理端缓存查看接口不返回这些 key 的详情）
 * - 集中维护，避免新增敏感缓存后忘记同步白名单
 * - 当前覆盖：
 *   - AUTH_RESULT 系：含账户权限/角色/菜单的完整快照，泄露可被攻击者分析权限模型
 *   - SYSTEM_CONFIG 系：含系统运行时配置（如短信/邮件密钥占位、限流阈值），泄露可被攻击者针对性绕过
 * - 前缀匹配规则：startsWith（精确匹配 AUTH_RESULT 不会误伤 AUTH_RESULT_PUB 之类的不存在 key）
 *
 * 使用：在 admin/cache.controller.ts 的 stats 接口过滤
 */
export const SENSITIVE_KEY_PREFIXES: readonly string[] = Object.freeze([
    AUTH_RESULT,
    ROLE_PERM,
    ROLE_MENUS,
    ROLE_ACCOUNTS,
    SYSTEM_CONFIG,
    MENU_VERSION,
    REFRESH_USED,
    REFRESH_FAMILY,
    OAUTH_STATE,
    TURNSTILE_VERIFY,
    SMS_CODE,
    SMS_ATTEMPTS,
    VERIFY_EMAIL,
    EMAIL_ATTEMPTS,
]);

/**
 * IP 登录锁定前缀：mono:lock:login:ip:{ip}
 * - 同一 IP 登录失败计数
 * - TTL 15 分钟
 */
export const LOGIN_LOCK_IP = 'mono:lock:login:ip';

/** 集中导出所有缓存 Key 前缀
 * - 业务代码统一引用 CACHE_KEYS.AUTH_RESULT 等
 * - 避免散落硬编码
 */
export const CACHE_KEYS = {
    AUTH_RESULT,
    ROLE_PERM,
    ROLE_MENUS,
    ROLE_ACCOUNTS,
    SYSTEM_CONFIG,
    MENU_VERSION,
    LOGIN_LOCK,
    LOGIN_LOCK_IP,
    FILE_UPLOAD,
    SMS_CODE,
    SMS_DAILY,
    SMS_INTERVAL,
    SMS_IP_HOURLY,
    SMS_ATTEMPTS,
    VERIFY_EMAIL,
    EMAIL_DAILY,
    EMAIL_INTERVAL,
    EMAIL_ATTEMPTS,
    REFRESH_USED,
    REFRESH_FAMILY,
    TURNSTILE_VERIFY,
    OAUTH_STATE,
    RATE_LIMIT,
    SENSITIVE_KEY_PREFIXES,
} as const;

/** 用户类型字面量类型（用于构造 key 时类型约束） */
export type UserType = 'admin' | 'member';

/**
 * Turnstile 验证结果 key 拼装函数
 * - 完整 key 格式：mono:verify:turnstile:{token}
 * - 以函数形式提供，避免 turnstile.service.ts 内散落模板字符串
 * - 该 helper 由 turnstile service 消费（防重放：用 token 做 key 标记已使用）
 */
export const turnstileVerifyKey = (token: string): string => `${TURNSTILE_VERIFY}:${token}`;
