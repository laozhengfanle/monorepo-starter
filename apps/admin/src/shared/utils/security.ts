/**
 * 安全工具函数
 *
 * 提供前端安全防护能力：
 *   - sanitizeHtml：转义 HTML 特殊字符，防止 XSS 注入
 *   - sanitizeUrl：校验 URL 协议，防止 javascript: 协议注入
 */

/**
 * HTML 特殊字符转义映射表
 *
 * 将可能被浏览器解析为 HTML 标签或属性的字符替换为实体引用，
 * 防止用户输入被当作 HTML 执行（XSS 攻击）。
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
};

/** 匹配所有需要转义的 HTML 特殊字符 */
const HTML_ESCAPE_REGEXP = /[&<>"']/g;

/**
 * 转义 HTML 特殊字符
 *
 * 用于在将用户输入插入 DOM 之前进行转义，
 * 防止 XSS（跨站脚本攻击）。
 *
 * @example
 * ```ts
 * const userInput = '<script>alert("xss")</script>';
 * const safe = sanitizeHtml(userInput);
 * // '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 * ```
 *
 * @param str 需要转义的字符串
 * @returns 转义后的安全字符串
 */
export function sanitizeHtml(str: string): string {
    return str.replace(HTML_ESCAPE_REGEXP, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * 校验 URL 是否为安全协议
 *
 * 仅允许 http: / https: / mailto: / tel: 协议，
 * 防止 javascript: / data: / vbscript: 等危险协议注入。
 *
 * @example
 * ```ts
 * isSafeUrl('https://example.com')  // true
 * isSafeUrl('javascript:alert(1)')  // false
 * isSafeUrl('data:text/html,...')   // false
 * ```
 *
 * @param url 需要校验的 URL
 * @returns 是否为安全 URL
 */
export function isSafeUrl(url: string): boolean {
    const trimmed = url.trim().toLowerCase();
    // 阻止协议相对 URL（如 //evil.com），浏览器会按当前协议解析
    if (trimmed.startsWith('//')) return false;
    // 允许的协议白名单
    const safeProtocols = ['http://', 'https://', 'mailto:', 'tel:', '/'];
    return safeProtocols.some((protocol) => trimmed.startsWith(protocol));
}
