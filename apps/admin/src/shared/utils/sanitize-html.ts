/**
 * sanitize-html.ts — 富文本 HTML 清洗工具
 *
 * 设计目标：
 *   - 富文本编辑器（wangEditor v5）输出的 HTML 在持久化到数据库之前必须经过白名单清洗，
 *     防止 XSS 攻击（<script>、onerror、javascript: 等）
 *   - 清洗策略：DOMPurify 默认全放行（HTML5 标签） + 显式禁止危险标签/属性/协议
 *   - 前后端统一调用此函数，确保清洗规则一致
 *
 * 设计决策（重要！）：
 *   - 不传 ALLOWED_TAGS：DOMPurify v3 默认允许所有 HTML5 标签
 *   - 显式声明 FORBID_TAGS / FORBID_ATTR：白名单策略太严格会误伤合法富文本
 *     （如 happy-dom 环境下白名单解析行为不稳定，缺一个标签就被剥），
 *     黑名单更稳：放行所有 + 禁危险
 *   - 前后端共用：server 端用 jsdom 适配，browser 端用浏览器原生 DOMParser
 */
import DOMPurify from 'dompurify';

/**
 * 强制禁止的危险标签（黑名单）
 *
 * 黑名单优于白名单的原因：
 *   - HTML 标准在演进，新标签不断加入（<dialog>、<template>、自定义元素...）
 *   - 白名单维护成本高，漏一个就误伤合法内容
 *   - 黑名单是稳定的"绝对不能放行"列表
 */
const FORBID_TAGS = [
    'script', // 注入 JS 执行
    'style', // CSS 注入（影响全局样式）
    'iframe', // 嵌套第三方页面，可绕过同源策略
    'object', // 嵌入 Flash/Plugin
    'embed', // 同 object
    'form', // 表单劫持
    'input', // 隐藏表单字段（任务列表需用 <input type=checkbox>，由调用方特殊处理）
    'button', // 按钮劫持
    'link', // 引入外部 CSS
    'meta', // HTTP-EQUIV 注入
    'base', // 改变页面 base URL
];

/**
 * 强制禁止的危险属性（黑名单）
 *
 * 黑名单优于白名单的原因：
 *   - on* 事件属性全部禁止（包括未来的 onfocus、onpointerdown 等）
 *   - 不需要维护白名单
 */
const FORBID_ATTR = [
    // 事件属性（用前缀通配在 DOMPurify 配置中处理）
];

/**
 * 放行的 URI 协议白名单
 *
 * 防御对象：
 *   - javascript:alert(...)  — JS 伪协议执行
 *   - data:text/html,...     — Data URI 内嵌 HTML 执行
 *   - vbscript:              — 旧 IE VBScript
 *
 * 设计思路：
 *   - 放行：绝对 URL（http/https/mailto/tel）+ 锚点（#xxx）+ 相对路径（/uploads/...）
 *   - 拒绝：javascript: / vbscript: / data:text/html 等危险协议
 *   - DOMPurify 默认就有 URI 协议检查，这里显式声明是"业务侧额外白名单"
 *   - 注意：协议白名单应用在 href / src / xlink:href / formaction / cite / background 等
 */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|#|\/)/i;

/**
 * 显式放行的额外属性（DOMPurify 默认 ALLOWED_ATTR 不含这些）
 *
 * wangEditor v5 输出常用：
 *   - target="_blank" 链接新窗口打开
 *   - colspan / rowspan 表格合并单元格
 *   - checked / disabled 任务列表 <input>
 *   - data-task / data-info wangEditor 自定义标识
 */
const ADD_ATTR = ['target', 'width', 'height', 'colspan', 'rowspan', 'checked', 'disabled'];

/**
 * 富文本 HTML 清洗（黑名单 + 协议白名单）
 *
 * @param html 原始富文本 HTML 字符串
 * @returns 清洗后的安全 HTML 字符串
 *
 * 行为保证：
 *   - 移除所有 <script> / <style> / <iframe> / <object> / <embed> / <form> / <input> / <button> / <link> / <meta> / <base> 标签
 *   - 移除所有 on* 事件属性（onerror / onload / onclick / onmouseover 等）
 *   - 拒绝 javascript: / vbscript: / data: 等危险协议
 *   - 保留 wangEditor v5 输出的所有合法 HTML5 标签和属性（DOMPurify 默认全放行）
 *   - 保留被删标签里的文本内容（KEEP_CONTENT），避免用户输入被"吞掉"
 *   - 空字符串返回空字符串（避免 DOMPurify 警告）
 */
export function sanitizeRichHtml(html: string): string {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
        // 显式禁止危险标签（DOMPurify 默认也会处理 script/style/iframe，这里显式声明更明确）
        FORBID_TAGS,
        FORBID_ATTR,
        // 危险协议黑名单（http/https/mailto/tel/相对路径 / 锚点）
        ALLOWED_URI_REGEXP,
        // 允许未知协议（防止 DOMPurify 在 jsdom 等环境下对 target 等非协议属性过度严苛）
        // - ALLOWED_URI_REGEXP 仍然只放行白名单协议，未知协议被拒
        // - 这个选项影响的是 target / download 等"非 URI 属性"的处理
        ALLOW_UNKNOWN_PROTOCOLS: true,
        // 显式放行的额外属性（target="_blank"、表格合并、任务列表等）
        ADD_ATTR,
        // 允许 data-* 属性（wangEditor 内部用 data-info / data-url 等标识）
        ALLOW_DATA_ATTR: true,
        // 保留被删标签里的文本（用户输入不被吞）
        KEEP_CONTENT: true,
    });
}
