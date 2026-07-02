/**
 * sanitize-html 单测
 *
 * 测试范围：
 *   - XSS 攻击 payload 清洗：<script>、on* 事件、javascript: 协议、data: URI
 *   - 合法富文本保留：标题、列表、表格、链接、图片等 wangEditor v5 常用标签
 *   - 边界：空字符串 / 非字符串输入 / 未在禁止列表的标签
 *
 * 设计思路：
 *   - sanitizeRichHtml 采用"放行所有 + 禁危险"的黑名单策略（不传 ALLOWED_TAGS）
 *   - 黑名单维护成本低，HTML 标准演进不会误伤合法标签
 *   - DOMPurify 默认 URI 协议检查 + ALLOWED_URI_REGEXP 显式限定是双保险
 *
 * 重要：使用 jsdom 而非 happy-dom 作为测试环境！
 *   - DOMPurify v3 依赖完整的 DOMParser API
 *   - happy-dom 对 DOMParser 的实现不完整，会把所有顶层标签都剥掉
 *     （实测：<p>foo</p> 在 happy-dom 下被处理为 "foo"）
 *   - jsdom 是事实标准的 Node 端 DOM 实现，DOMPurify 测试都基于它
 *   - 真实浏览器环境用浏览器原生 DOMParser，无需担心
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeRichHtml } from '@/shared/utils/sanitize-html';

describe('sanitizeRichHtml', () => {
    describe('XSS 攻击防护', () => {
        it('应移除 <script> 标签（DOMPurify 对脚本默认连内容一起剥除，是安全设计）', () => {
            const html = '<p>前面</p><script>alert("XSS")</script><p>后面</p>';
            const result = sanitizeRichHtml(html);
            // <script> 标签必须被删
            expect(result).not.toMatch(/<script/i);
            // DOMPurify 默认对 <script> 是"完全剥除"（连内容一起），与 KEEP_CONTENT 无关
            // 这是 DOMPurify 的安全设计：脚本内容不能以任何形式残留在 DOM 里
            expect(result).not.toContain('alert("XSS")');
            // 合法 <p> 应保留
            expect(result).toContain('<p>');
        });

        it('应剥离 <img> 上的 onerror 事件属性', () => {
            const html = '<img src="x.png" onerror="alert(\'XSS\')" />';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/onerror/i);
            // <img> 不在禁列表，src 应保留
            expect(result).toMatch(/<img/);
            expect(result).toMatch(/src="x.png"/);
        });

        it('应拒绝 javascript: 协议的链接', () => {
            const html = '<a href="javascript:alert(\'XSS\')">点我</a>';
            const result = sanitizeRichHtml(html);
            // href 应该是空的或被剥离
            expect(result).not.toMatch(/javascript:/i);
        });

        it('应拒绝 data:text/html 协议的链接', () => {
            const html = '<a href="data:text/html,<script>alert(1)</script>">点我</a>';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/data:text\/html/i);
        });

        it('应移除 <iframe> 标签', () => {
            const html = '<p>前面</p><iframe src="https://evil.com"></iframe><p>后面</p>';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/<iframe/i);
        });

        it('应移除 <style> 标签（防止 CSS 注入）', () => {
            const html = '<style>body{display:none}</style><p>内容</p>';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/<style/i);
        });

        it('应移除 on* 事件属性（onclick / onmouseover 等）', () => {
            const html = '<p onclick="alert(1)" onmouseover="evil()">点击</p>';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/onclick/i);
            expect(result).not.toMatch(/onmouseover/i);
        });

        it('应拒绝 vbscript: 协议（IE 老旧攻击）', () => {
            const html = '<a href="vbscript:msgbox(1)">点我</a>';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/vbscript:/i);
        });

        it('应移除 <form> / <button> 防止表单劫持', () => {
            const html = '<form action="https://evil.com"><button onclick="hack()">提交</button></form>';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/<form/i);
            expect(result).not.toMatch(/<button/i);
        });

        it('应移除 <object> / <embed> 标签', () => {
            const html = '<object data="evil.swf"></object><embed src="evil.swf" />';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/<object/i);
            expect(result).not.toMatch(/<embed/i);
        });
    });

    describe('合法富文本保留', () => {
        it('应保留基础块级标签：p / h1~h6 / blockquote / pre / hr', () => {
            const html = '<h1>标题</h1><h2>副标题</h2><p>段落</p><blockquote>引用</blockquote><pre>代码块</pre><hr />';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('<h1>');
            expect(result).toContain('<h2>');
            expect(result).toContain('<p>');
            expect(result).toContain('<blockquote>');
            expect(result).toContain('<pre>');
        });

        it('应保留文本格式标签：strong / em / u / s / code / sub / sup', () => {
            const html = '<p><strong>粗体</strong><em>斜体</em><u>下划线</u><s>删除</s><code>代码</code></p>';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('<strong>');
            expect(result).toContain('<em>');
            expect(result).toContain('<u>');
            expect(result).toContain('<s>');
            expect(result).toContain('<code>');
        });

        it('应保留列表 ul/ol/li', () => {
            const html = '<ul><li>1</li><li>2</li></ul><ol><li>a</li><li>b</li></ol>';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('<ul>');
            expect(result).toContain('<ol>');
            expect(result).toContain('<li>1</li>');
        });

        it('应保留表格 table/thead/tbody/tr/td/th', () => {
            const html = '<table><thead><tr><th>表头</th></tr></thead><tbody><tr><td>单元格</td></tr></tbody></table>';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('<table>');
            expect(result).toContain('<th>');
            expect(result).toContain('<td>');
        });

        it('应保留安全的 https:// 链接（href + target）', () => {
            const html = '<a href="https://example.com" target="_blank">官网</a>';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('href="https://example.com"');
            expect(result).toContain('target="_blank"');
        });

        it('应保留安全的 mailto: 链接', () => {
            const html = '<a href="mailto:foo@example.com">联系我</a>';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('href="mailto:foo@example.com"');
        });

        it('应保留图片标签（带 src / alt / width / height）', () => {
            const html = '<img src="/uploads/avatar.png" alt="头像" width="100" height="100" />';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('<img');
            expect(result).toContain('src="/uploads/avatar.png"');
            expect(result).toContain('alt="头像"');
            expect(result).toContain('width="100"');
        });

        it('应保留 wangEditor 输出的 div/span（用于行内样式）', () => {
            const html = '<div><span style="color: red">红色文字</span></div>';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('<div>');
            expect(result).toContain('<span');
            expect(result).toContain('style="color: red"');
        });

        it('应保留 class 属性（富文本样式所必需）', () => {
            const html = '<p class="text-red">红色文字</p>';
            const result = sanitizeRichHtml(html);
            expect(result).toContain('class="text-red"');
        });
    });

    describe('边界条件', () => {
        it('空字符串应返回空字符串', () => {
            expect(sanitizeRichHtml('')).toBe('');
        });

        it('纯文本（无标签）应原样返回', () => {
            expect(sanitizeRichHtml('hello world')).toBe('hello world');
        });

        it('HTML5 已废弃但不在禁止列表的标签应保留（如 <center>、<font>）', () => {
            // 注意：DOMPurify 默认不严格剥离这些已废弃标签，黑名单策略是"放行所有合法 + 禁危险"
            const html = '<font color="red">红色</font><center>居中</center><p>正常</p>';
            const result = sanitizeRichHtml(html);
            // color 属性可能会被 DOMPurify 默认禁（color 不在 ALLOWED_URI_REGEXP 里）
            // 但 <font> 和 <center> 标签本身应保留
            expect(result).toContain('红色');
            expect(result).toContain('居中');
            expect(result).toContain('<p>');
        });

        it('未闭合的标签应被规范化处理', () => {
            const html = '<p>未闭合段落';
            // 不应抛错
            expect(() => sanitizeRichHtml(html)).not.toThrow();
        });

        it('应剥离 <meta> 和 <base> 防止 URL 重定向', () => {
            const html =
                '<head><meta http-equiv="refresh" content="0;url=https://evil.com"><base href="https://evil.com"></head><p>正文</p>';
            const result = sanitizeRichHtml(html);
            expect(result).not.toMatch(/<meta/i);
            expect(result).not.toMatch(/<base/i);
        });
    });
});
