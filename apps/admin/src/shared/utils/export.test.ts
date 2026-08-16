import { describe, expect, it } from 'vitest';
import { toCSV, toExcel } from './export.js';

describe('toCSV', () => {
  it('基础二维数组转 CSV', () => {
    expect(
      toCSV([
        ['姓名', '年龄'],
        ['张三', 30],
      ]),
    ).toBe('姓名,年龄\n张三,\t30');
  });

  it('单元格含逗号/引号/换行时转义', () => {
    const csv = toCSV([['a,b', 'say "hi"', 'line\nbreak']]);

    expect(csv).toBe('"a,b","say ""hi""","line\nbreak"');
  });

  it('null/undefined 输出空字符串', () => {
    expect(toCSV([[null, undefined, 'x']])).toBe(',,x');
  });

  it('数字加 \\t 前缀防 Excel 丢精度', () => {
    // 注意：测试字面量必须是 JS 安全整数（>2^53 会被字面量解析舍入）
    const csv = toCSV([[123456789]]);
    expect(csv).toContain('\t123456789');
  });
});

describe('toExcel', () => {
  it('生成 HTML table 结构', () => {
    const excel = toExcel([
      ['姓名', '年龄'],
      ['张三', 30],
    ]);

    expect(excel).toContain('<table');
    expect(excel).toContain('<th>姓名</th>');
    expect(excel).toContain('<td>张三</td>');
  });

  it('空数组返回空 table', () => {
    expect(toExcel([])).toBe('<table></table>');
  });

  it('HTML 特殊字符转义', () => {
    const excel = toExcel([['<script>alert(1)</script>']]);

    expect(excel).not.toContain('<script>');
    expect(excel).toContain('&lt;script&gt;');
  });
});
