import { readSpreadsheet, col } from "@/lib/excel";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportResult = {
  imported: number;
  skipped: { row: number; reason: string }[];
};

/** Parse many date shapes → YYYY-MM-DD */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // D/M/YY, M/D/YY, DD/MM/YYYY, MM/DD/YYYY, with / - or .
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000; // 25 → 2025

    let day: number;
    let month: number;

    if (a > 12 && b <= 12) {
      // 13/10/2025 → day/month
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      // 10/13/2025 → month/day
      month = a;
      day = b;
    } else {
      // Both <= 12: Excel often shows US style 10/1/25 = Oct 1
      // (matches your file: 10/1/25, 10/6/25)
      month = a;
      day = b;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  // Excel serial number as string
  const n = Number(s.replace(",", "."));
  if (Number.isFinite(n) && n > 20000 && n < 100000) {
    const utc = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000;
    const d = new Date(utc);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/** 59,00 / 1 309,00 / 1309.00 → number */
export function parsePrice(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  // remove spaces (thousands)
  s = s.replace(/\s/g, "");
  // 1.309,00 → 1309.00
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const ALLOWED_STATUS = new Set([
  "Submitted",
  "Ordered",
  "Received",
  "Delivered",
  "Closed",
  "Rejected",
  "Cancelled",
]);

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function importRequestsFromFile(
  supabase: SupabaseClient,
  file: File
): Promise<ImportResult> {
  const rows = await readSpreadsheet(file);
  const skipped: ImportResult["skipped"] = [];
  let imported = 0;

  // Load lookup tables once
  const [{ data: profiles }, { data: coworkers }, { data: tools }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("coworkers").select("id, external_id, name"),
    supabase.from("tools").select("id, name, reference, supplier, product_url, unit_price"),
  ]);

  const profileByName = new Map<string, string>();
  const profileByEmail = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.full_name) profileByName.set(norm(p.full_name), p.id);
    if (p.email) profileByEmail.set(norm(p.email), p.id);
  }

  const coworkerByExt = new Map<string, string>();
  const coworkerByName = new Map<string, string>();
  for (const c of coworkers ?? []) {
    if (c.external_id) coworkerByExt.set(norm(String(c.external_id)), c.id);
    if (c.name) coworkerByName.set(norm(c.name), c.id);
  }

    type ToolRow = {
    id: string;
    name: string;
    reference: string | null;
    supplier: string | null;
    product_url: string | null;
    unit_price: number | null;
  };

  const toolList = (tools ?? []) as ToolRow[];
  const toolByRef = new Map<string, ToolRow>();
  const toolByName = new Map<string, ToolRow>();
  for (const t of toolList) {
    if (t.reference) toolByRef.set(norm(String(t.reference)), t);
    if (t.name) toolByName.set(norm(t.name), t);
  }

  const toInsert: Record<string, unknown>[] = [];

  rows.forEach((row, index) => {
    const excelRow = index + 2; // header is row 1

    const requestDateRaw = col(row, "Request Date", "request_date", "Date");
    const requesterRaw = col(row, "Requester Name", "Requester", "requested_by");
    const agentId = col(row, "Agent Id", "Agent ID", "Id", "external_id");
    const agentName = col(row, "Agent Name", "Coworker", "coworker");
    const toolName = col(row, "Tool Name", "Tool", "tool_name");
    const reference = col(row, "Reference", "Référence", "Ref");
    const qtyRaw = col(row, "Quantity", "Qty", "quantity");
    const statusRaw = col(row, "Status", "status");
    const handoverRaw = col(row, "Handover Date", "Handover", "handover_date");
    const priceRaw = col(row, "Unit Price", "Price", "unit_price");
    const note = col(row, "Note", "note") || null;
    const rejection = col(row, "Rejection Reason", "rejection_reason") || null;

    if (!toolName && !reference) {
      skipped.push({ row: excelRow, reason: "Missing Tool Name / Reference" });
      return;
    }

    const request_date = parseDate(requestDateRaw);
    if (!request_date) {
      skipped.push({ row: excelRow, reason: `Bad Request Date: "${requestDateRaw}"` });
      return;
    }

    // Requester
    let requested_by: string | null = null;
    if (requesterRaw) {
      requested_by =
        profileByName.get(norm(requesterRaw)) ||
        profileByEmail.get(norm(requesterRaw)) ||
        null;
    }
    if (!requested_by) {
      skipped.push({
        row: excelRow,
        reason: `Requester not found: "${requesterRaw}" (set Full name on Users page)`,
      });
      return;
    }

    // Coworker
    let coworker_id: string | null = null;
    if (agentId) coworker_id = coworkerByExt.get(norm(agentId)) || null;
    if (!coworker_id && agentName) coworker_id = coworkerByName.get(norm(agentName)) || null;
    if (!coworker_id) {
      skipped.push({
        row: excelRow,
        reason: `Coworker not found: Id="${agentId}" Name="${agentName}"`,
      });
      return;
    }

    // Tool (optional match)
    const tool =
      (reference && toolByRef.get(norm(reference))) ||
      (toolName && toolByName.get(norm(toolName))) ||
      null;

    // Status
    let status = (statusRaw || "").trim();
    const handover_date = parseDate(handoverRaw);
    if (!status && handover_date) status = "Delivered";
    if (!status) status = "Submitted";
    // normalize common typos
    const statusMap: Record<string, string> = {
      delivered: "Delivered",
      ordered: "Ordered",
      submitted: "Submitted",
      received: "Received",
      closed: "Closed",
      rejected: "Rejected",
      cancelled: "Cancelled",
      canceled: "Cancelled",
    };
    status = statusMap[status.toLowerCase()] || status;
    if (!ALLOWED_STATUS.has(status)) {
      skipped.push({ row: excelRow, reason: `Invalid Status: "${statusRaw}"` });
      return;
    }

    const quantity = Math.max(1, parseInt(qtyRaw.replace(/\s/g, ""), 10) || 1);
    const unit_price =
      parsePrice(priceRaw) ??
      (tool?.unit_price != null ? Number(tool.unit_price) : null);

    toInsert.push({
      request_date,
      requested_by,
      coworker_id,
      tool_id: tool?.id ?? null,
      tool_name: tool?.name || toolName,
      reference: reference || tool?.reference || null,
      description: null,
      supplier: tool?.supplier || "Bricoma",
      supplier_url: tool?.product_url || null,
      quantity,
      note,
      status,
      rejection_reason: status === "Rejected" ? rejection : null,
      handover_date:
        status === "Delivered" || status === "Closed" ? handover_date : null,
      unit_price,
    });
  });

  // Insert in chunks of 50
  const CHUNK = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await supabase.from("requests").insert(chunk);
    if (error) {
      throw new Error(error.message);
    }
    imported += chunk.length;
  }

  return { imported, skipped };
}
