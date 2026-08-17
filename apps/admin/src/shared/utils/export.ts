/**
 * 触发浏览器下载（CSV 自动加 UTF-8 BOM，Excel 打开中文不乱码）
 */
export function downloadBlob(
  content: BlobPart,
  filename: string,
  mimeType = 'text/csv;charset=utf-8;',
): void {
  const isCsv = mimeType.startsWith('text/csv');
  const blob = new Blob([isCsv ? '\uFEFF' : '', content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 以公式注入前缀开头的单元格（Excel/CSV 会当作公式执行） */
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/**
 * 公式注入防护：对以 = + - @ 或制表符/回车开头的字符串单元格加单引号前缀，
 * 使 Excel 将其视为纯文本而非公式（OWASP CSV Injection 缓解措施）。
 */
function guardFormula(value: string): string {
  return FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
}

/** 二维数组 → CSV（单元格含逗号/引号/换行时转义；数字加 \t 防 Excel 丢精度；公式前缀加引号防注入） */
export function toCSV(
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const escape = (v: string | number | boolean | null | undefined): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return `\t${v}`;
    const s = guardFormula(String(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((row) => row.map(escape).join(',')).join('\n');
}

/** 二维数组 → Excel（HTML table + .xls 后缀，老项目同款方案；公式前缀加引号防注入） */
export function toExcel(
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const escape = (v: string | number | boolean | null | undefined): string => {
    if (v === null || v === undefined) return '';
    return guardFormula(String(v))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };
  if (rows.length === 0) return '<table></table>';
  const thead = `<tr>${rows[0].map((c) => `<th>${escape(c)}</th>`).join('')}</tr>`;
  const tbody = rows
    .slice(1)
    .map(
      (row) => `<tr>${row.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table border="1"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}
