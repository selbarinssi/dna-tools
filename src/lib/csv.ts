type Cell = string | number | null | undefined;

/**
 * Builds a CSV that opens correctly in Excel (also with French/Moroccan
 * regional settings, where the separator is ";"): UTF-8 BOM + "sep=;" hint.
 */
export function toCsv(rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFFsep=;\r\n" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export function downloadCsv(filename: string, rows: Cell[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
