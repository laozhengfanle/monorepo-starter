/**
 * 安全解析 JSON：解析失败返回原始字符串（不抛异常），
 * 供审计详情等后端脏数据兜底展示，避免 JSON.parse 崩溃白屏。
 */
export function safeParseJson<T = unknown>(input: string): T | string {
  try {
    return JSON.parse(input) as T;
  } catch {
    return input;
  }
}
