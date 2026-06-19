/**
 * 前端统一日志工具
 *
 * 为什么要自建一个 logger：
 * - 后端用 pino，输出结构化 JSON 便于日志聚合
 * - 前端没有 pino 依赖，也不需要结构化日志
 * - 但项目中不应该到处散落 console.log/warn/error，不利于后期统一替换或上报
 * - 这里提供一个 4 级别 logger（info / warn / error / debug），API 与 pino 风格一致
 *
 * 使用规范：
 *   - 业务代码统一 `import logger from '@/shared/utils/logger'`
 *   - 然后 `logger.info(...) / logger.warn(...) / logger.error(...) / logger.debug(...)`
 *   - 不再直接调用 console.*
 *
 * 日志级别（按严重程度递增）：
 *   - debug：仅开发环境输出，排查问题时用
 *   - info：一般流程信息（默认输出）
 *   - warn：需要关注但不影响主流程
 *   - error：错误，需要修复
 *
 * 调用签名（与 pino 保持一致）：
 *   - logger.info(msg: string, meta?: Record<string, unknown>)
 *   - logger.warn(msg: string, meta?: Record<string, unknown>)
 *   - logger.error(msg: string, meta?: Record<string, unknown>)
 *   - logger.debug(msg: string, meta?: Record<string, unknown>)
 *
 * 后续可扩展点（不在本次任务范围）：
 *   - 接入 Sentry / 埋点 SDK，把 error 上报
 *   - 支持 LOG_LEVEL 环境变量控制
 *   - 支持日志脱敏（手机号 / 身份证 / token 等）
 */

/** 日志级别枚举，方便阅读 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 当前最低输出级别：debug < info < warn < error，低于此级别的日志不会打印 */
const CURRENT_LEVEL: LogLevel = 'debug';

/** 级别对应的数值（数字越大越严重） */
const LEVEL_RANK: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

/** 级别对应的 console 方法（前端没有专用 logger API，复用 console） */
const LEVEL_CONSOLE: Record<LogLevel, (...args: unknown[]) => void> = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

/** 级别对应的标签，打印时前缀用 */
const LEVEL_TAG: Record<LogLevel, string> = {
    debug: '🔍 [DEBUG]',
    info: 'ℹ️  [INFO]',
    warn: '⚠️  [WARN]',
    error: '❌ [ERROR]',
};

/**
 * 判断当前级别是否应该输出
 *
 * 例子：CURRENT_LEVEL = 'info'，传入 'debug' 时返回 false（不打印）
 */
function shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[CURRENT_LEVEL];
}

/**
 * 通用日志输出函数（内部使用，对外暴露的是封装好的 info/warn/error/debug）
 *
 * @param level  日志级别
 * @param msg    主要描述文本
 * @param meta   可选附加信息，会以对象形式展开打印
 */
function logAt(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    // 低于当前最低级别的日志直接丢弃
    if (!shouldLog(level)) return;

    const tag = LEVEL_TAG[level];
    const printer = LEVEL_CONSOLE[level];

    // 有 meta 时把对象也带上；没有 meta 时只打 msg
    if (meta && Object.keys(meta).length > 0) {
        printer(tag, msg, meta);
    } else {
        printer(tag, msg);
    }
}

/** Logger 对象：对外暴露 4 个级别方法 */
const logger = {
    /**
     * 输出一条 debug 级别日志（开发调试用）
     * @param msg  描述文本
     * @param meta 可选附加信息
     */
    debug(msg: string, meta?: Record<string, unknown>): void {
        logAt('debug', msg, meta);
    },

    /**
     * 输出一条 info 级别日志（一般流程信息）
     * @param msg  描述文本
     * @param meta 可选附加信息
     */
    info(msg: string, meta?: Record<string, unknown>): void {
        logAt('info', msg, meta);
    },

    /**
     * 输出一条 warn 级别日志（需要关注但不影响主流程）
     * @param msg  描述文本
     * @param meta 可选附加信息
     */
    warn(msg: string, meta?: Record<string, unknown>): void {
        logAt('warn', msg, meta);
    },

    /**
     * 输出一条 error 级别日志（错误，需要修复）
     * @param msg  描述文本
     * @param meta 可选附加信息（常传 `{ error }`）
     */
    error(msg: string, meta?: Record<string, unknown>): void {
        logAt('error', msg, meta);
    },
};

export default logger;
