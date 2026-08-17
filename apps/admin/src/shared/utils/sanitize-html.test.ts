import { describe, expect, it } from 'vitest';
import { sanitizeRichHtml } from './sanitize-html.js';

describe('sanitizeRichHtml', () => {
  it('剥离危险标签 script/style/iframe', () => {
    const html =
      '<p>正常内容</p><script>alert(1)</script><iframe src="evil"></iframe>';

    const result = sanitizeRichHtml(html);

    expect(result).toContain('<p>正常内容</p>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('alert');
  });

  it('剥离事件属性 onerror/onclick', () => {
    const html =
      '<img src="x" onerror="alert(1)"><div onclick="steal()">x</div>';

    const result = sanitizeRichHtml(html);

    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onclick');
  });

  it('拦截 javascript: URI', () => {
    const html = '<a href="javascript:alert(1)">点我</a>';

    const result = sanitizeRichHtml(html);

    expect(result).not.toContain('javascript:');
  });

  it('协议白名单生效：javascript:/file: 链接被剥除，data 图片内联保留', () => {
    const html =
      '<a href="javascript:alert(1)">js</a>' +
      '<img src="data:image/png;base64,AAAA" alt="pic">' +
      '<a href="file:///etc/passwd">file</a>';

    const result = sanitizeRichHtml(html);

    // 危险协议：href 属性被剥除（KEEP_CONTENT 保留文本内容）
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('href=');
    expect(result).toContain('js');
    expect(result).toContain('file');
    // data:image/* 内联图片（富文本粘贴场景）由 DOMPurify 标准策略保留
    expect(result).toContain('src="data:image/png;base64,AAAA"');
  });

  it('放行安全链接', () => {
    const html = '<a href="https://example.com">官网</a><p>正文</p>';

    const result = sanitizeRichHtml(html);

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('<p>正文</p>');
    // 富文本场景下 target 等跳转属性由 DOMPurify 策略决定，不做强断言
  });

  it('空输入安全处理', () => {
    expect(sanitizeRichHtml('')).toBe('');
    expect(sanitizeRichHtml('<p></p>')).toBe('<p></p>');
  });
});
