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

  it('公式注入前缀 = + - @ 加单引号防护', () => {
    const csv = toCSV([['=SUM(A1:A2)', '+1+1', '-2+3', '@cmd', '正常文本']]);
    // guardFormula 只加单引号前缀；值含逗号/引号/换行时才额外包引号
    expect(csv).toBe("'=SUM(A1:A2),'+1+1,'-2+3,'@cmd,正常文本");
  });

  it('制表符/回车开头同样加单引号防护', () => {
    // guard 后 '\r\n' 含换行 → 额外包引号；\t 是真实制表符
    expect(toCSV([['\t5', '\r\n']])).toBe('\'\t5,"\'\r\n"');
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

  it('公式注入前缀 = + - @ 加单引号防护', () => {
    // toExcel：首行是 thead（<th>），数据行才是 <td>
    const excel = toExcel([['col'], ['=1+1', '+cmd', '-2', '@import']]);

    expect(excel).toContain("<td>'=1+1</td>");
    expect(excel).toContain("'+cmd");
    expect(excel).toContain("'-2");
    expect(excel).toContain("'@import");
    expect(excel).not.toContain('<td>=1+1</td>');
  });
});
