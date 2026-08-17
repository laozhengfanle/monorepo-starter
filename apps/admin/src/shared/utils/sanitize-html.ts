import DOMPurify from 'dompurify';

/**
 * 富文本 HTML 清洗（前端）
 *
 * 设计目标：
 *   - 富文本编辑器（Tiptap）输出的 HTML 在持久化到数据库之前必须经过清洗，
 *     防止 XSS 攻击（<script>、onerror、javascript: 等）
 *   - 策略：DOMPurify 默认放行 HTML5 标签 + 黑名单禁止危险标签/属性 + URI 协议白名单
 *   - 与后端 sanitizeRichHtml 保持同一策略（后端入库再清洗一次，双重保险）
 */

/** 强制禁止的危险标签（黑名单） */
const FORBID_TAGS = [
  'script', // 注入 JS 执行
  'style', // CSS 注入
  'iframe', // 嵌套第三方页面
  'object', // Flash/Plugin
  'embed', // 同 object
  'form', // 表单劫持
  'input', // 隐藏表单字段
  'button', // 按钮劫持
  'link', // 外部 CSS
  'meta', // HTTP-EQUIV 注入
  'base', // 改变页面 base URL
];

/** 放行的 URI 协议白名单（http/https/mailto/tel/锚点/相对路径） */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|#|\/)/i;

/** wangEditor/Tiptap 常用额外属性（DOMPurify 默认不含） */
const ADD_ATTR = [
  'target',
  'width',
  'height',
  'colspan',
  'rowspan',
  'checked',
  'disabled',
];

/**
 * 富文本 HTML 清洗（黑名单 + 协议白名单）
 *
 * @param html 原始富文本 HTML 字符串
 * @returns 清洗后的安全 HTML
 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR: [],
    ALLOWED_URI_REGEXP,
    // 注意：不能开 ALLOW_UNKNOWN_PROTOCOLS，否则协议白名单被架空
    //（javascript:/data:/file: 等危险协议会被放行）
    ADD_ATTR,
    ALLOW_DATA_ATTR: true,
    KEEP_CONTENT: true,
  });
}
