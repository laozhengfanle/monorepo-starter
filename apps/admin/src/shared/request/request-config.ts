/**
 * 请求全局配置 — 单例
 *
 * 为什么有这个模块？
 *   config store 和 request/graphql-client 之间存在循环依赖（config → configs API → graphql-client → request），
 *   因此 request.ts 不能直接 import config store。
 *   这个模块是纯数据层，不依赖任何模块，供两边共同引用：
 *     - config store / SettingsPage 写入超时值
 *     - request.ts / graphql-client.ts 读取超时值
 */

/** API 基础路径，从环境变量读取，默认 /api */
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/** 全局请求超时时间（毫秒），默认 10 秒 */
let _timeout = 10000;

/** 设置全局请求超时（由 config store 在配置加载/保存后调用） */
export function setRequestTimeout(ms: number): void {
    _timeout = ms;
}

/** 获取当前全局请求超时 */
export function getRequestTimeout(): number {
    return _timeout;
}
