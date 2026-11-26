import * as XLSX from "xlsx";

/** Read first sheet of a .xlsx / .xls / .csv file into rows (header = keys). */
export async function readSpreadsheet(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[String(k).trim()] = String(v ?? "").trim();
    }
    return out;
  });
}

/** Get a cell by trying several possible header names (case-insensitive). */
export function col(row: Record<string, string>, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (found && row[found] !== "") return row[found];
  }
  return "";
}
