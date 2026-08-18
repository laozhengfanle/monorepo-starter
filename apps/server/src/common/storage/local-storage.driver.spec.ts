import { describe, expect, it } from 'vitest';
import {
  extractSafeExtension,
  mimeTypeMatchesExtension,
  ALLOWED_UPLOAD_EXTENSIONS,
} from './local-storage.driver.js';

describe('extractSafeExtension', () => {
  it('白名单扩展名 → 小写返回', () => {
    expect(extractSafeExtension('photo.JPG')).toBe('jpg');
    expect(extractSafeExtension('report.PDF')).toBe('pdf');
    expect(extractSafeExtension('archive.zip')).toBe('zip');
  });

  it('无扩展名 / 隐藏文件 / 结尾点 → 空', () => {
    expect(extractSafeExtension('noext')).toBe('');
    expect(extractSafeExtension('.gitignore')).toBe('');
    expect(extractSafeExtension('trailing.')).toBe('');
  });

  it('脚本类型（svg/html/js）不在白名单 → 拒绝（防存储型 XSS）', () => {
    expect(extractSafeExtension('evil.svg')).toBe('');
    expect(extractSafeExtension('page.html')).toBe('');
    expect(extractSafeExtension('x.js')).toBe('');
    expect(ALLOWED_UPLOAD_EXTENSIONS).not.toContain('svg');
    expect(ALLOWED_UPLOAD_EXTENSIONS).not.toContain('html');
    expect(ALLOWED_UPLOAD_EXTENSIONS).not.toContain('js');
  });

  it('未知扩展名 → 空', () => {
    expect(extractSafeExtension('weird.xyz')).toBe('');
  });
});

describe('mimeTypeMatchesExtension', () => {
  it('匹配的 MIME + 扩展名 → true', () => {
    expect(mimeTypeMatchesExtension('image/png', 'png')).toBe(true);
    expect(mimeTypeMatchesExtension('application/pdf', 'pdf')).toBe(true);
  });

  it('MIME 与扩展名不匹配（防伪装）→ false', () => {
    expect(mimeTypeMatchesExtension('text/html', 'png')).toBe(false);
    expect(mimeTypeMatchesExtension('application/javascript', 'jpg')).toBe(
      false,
    );
  });

  it('容忍带参数的 MIME（如 text/plain; charset=utf-8）', () => {
    expect(mimeTypeMatchesExtension('text/plain; charset=utf-8', 'txt')).toBe(
      true,
    );
  });

  it('大小写不敏感', () => {
    expect(mimeTypeMatchesExtension('Image/PNG', 'png')).toBe(true);
  });
});
