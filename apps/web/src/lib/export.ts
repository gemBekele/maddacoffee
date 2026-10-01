/**
 * CSV export and printing.
 *
 * CSV is built in the browser rather than server-side: the dashboard already
 * holds exactly the figures on screen, so exporting what the user can see
 * avoids a second query that could disagree with it.
 */

/** Quote a cell if it contains a delimiter, quote, or newline. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; header: string }[]): string {
  if (!rows.length) return '';
  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, header: k }));
  const head = cols.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => cols.map((c) => cell(r[c.key])).join(',')).join('\r\n');
  return `${head}\r\n${body}`;
}

/**
 * Download a CSV.
 *
 * A BOM is prepended so Excel opens UTF-8 correctly; without it, non-ASCII
 * names (Afaan Oromoo, buyer names with diacritics) arrive mangled.
 */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Export an array of objects as a CSV download. */
export function exportRows(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: { key: string; header: string }[],
) {
  if (!rows.length) return false;
  downloadCsv(filename, toCsv(rows, columns));
  return true;
}

/** Trigger the browser print dialog. Print rules live in index.css. */
export function printPage() {
  window.print();
}
