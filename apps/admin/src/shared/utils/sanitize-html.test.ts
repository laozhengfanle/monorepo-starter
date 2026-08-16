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

  it('放行安全链接与常用属性', () => {
    const html =
      '<a href="https://example.com" target="_blank">官网</a><p>正文</p>';

    const result = sanitizeRichHtml(html);

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('<p>正文</p>');
  });

  it('空输入安全处理', () => {
    expect(sanitizeRichHtml('')).toBe('');
    expect(sanitizeRichHtml('<p></p>')).toBe('<p></p>');
  });
});
