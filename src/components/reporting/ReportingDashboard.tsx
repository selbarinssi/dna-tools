"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Request, RequestStatus } from "@/types";
import { NO_SPEND_STATUSES, OPEN_STATUSES, REQUEST_STATUSES, STATUS_COLORS } from "@/lib/constants";
import { fetchAllRows, formatMoney, lineTotal, requesterName } from "@/lib/requests";
import { downloadCsv } from "@/lib/csv";
import { inputClass, btnGhost, errorBox } from "@/components/ui/styles";
import { RefreshCw, Download } from "lucide-react";
import { differenceInCalendarDays, format, startOfMonth, startOfYear, subDays } from "date-fns";

const SELECT = `
  id, status, quantity, unit_price, request_date, handover_date, tool_name,
  requester:profiles!requested_by (id, full_name, email),
  coworker:coworkers (id, name, team)
`;

interface Group {
  key: string;
  name: string;
  count: number;
  qty: number;
  spend: number;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function groupBy(rows: Request[], keyFn: (r: Request) => string, nameFn: (r: Request) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = keyFn(r);
    const g = map.get(key) ?? { key, name: nameFn(r), count: 0, qty: 0, spend: 0 };
    g.count += 1;
    g.qty += r.quantity || 0;
    if (!NO_SPEND_STATUSES.includes(r.status)) g.spend += lineTotal(r) ?? 0;
    map.set(key, g);
  }
  return Array.from(map.values());
}

export default function ReportingDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = not initialised yet (the default "this year" is set in an effect,
  // because reading the current date during render is not allowed here)
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState("");

  useEffect(() => {
    setFrom(iso(startOfYear(new Date())));
  }, []);

  const load = useCallback(async () => {
    if (from === null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllRows<Request>((a, b) => {
        let q = supabase.from("requests").select(SELECT);
        if (from) q = q.gte("request_date", from);
        if (to) q = q.lte("request_date", to);
        return q.order("request_date", { ascending: false }).order("id").range(a, b) as unknown as PromiseLike<{
          data: Request[] | null;
          error: { message: string } | null;
        }>;
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
    setLoading(false);
  }, [supabase, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let open = 0;
    let spend = 0;
    let missingPrice = 0;
    let leadSum = 0;
    let leadCount = 0;

    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (OPEN_STATUSES.includes(r.status)) open += 1;
      if (!NO_SPEND_STATUSES.includes(r.status)) {
        const t = lineTotal(r);
        if (t === null) missingPrice += 1;
        else spend += t;
      }
      if (r.handover_date && (r.status === "Delivered" || r.status === "Closed")) {
        leadSum += Math.max(0, differenceInCalendarDays(new Date(r.handover_date), new Date(r.request_date)));
        leadCount += 1;
      }
    }

    const monthMap = new Map<string, { month: string; count: number; spend: number }>();
    for (const r of rows) {
      const m = r.request_date.slice(0, 7);
      const g = monthMap.get(m) ?? { month: m, count: 0, spend: 0 };
      g.count += 1;
      if (!NO_SPEND_STATUSES.includes(r.status)) g.spend += lineTotal(r) ?? 0;
      monthMap.set(m, g);
    }

    return {
      byStatus,
      open,
      spend,
      missingPrice,
      avgLead: leadCount ? leadSum / leadCount : null,
      byMonth: Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      byRequester: groupBy(rows, (r) => r.requester?.id ?? "unknown", requesterName).sort((a, b) => b.count - a.count),
      byCoworker: groupBy(rows, (r) => r.coworker?.id ?? "unknown", (r) => r.coworker?.name ?? "Unknown").sort((a, b) => b.count - a.count),
    };
  }, [rows]);

  const preset = (kind: "month" | "90" | "year" | "all") => {
    const today = new Date();
    setTo("");
    if (kind === "month") setFrom(iso(startOfMonth(today)));
    if (kind === "90") setFrom(iso(subDays(today, 90)));
    if (kind === "year") setFrom(iso(startOfYear(today)));
    if (kind === "all") setFrom("");
  };

  const exportCsv = () =>
    downloadCsv(`report-${format(new Date(), "yyyy-MM-dd")}.csv`, [
      ["Request date", "Tool", "Coworker", "Requested by", "Qty", "Unit price", "Total", "Status", "Handover date"],
      ...rows.map((r) => [r.request_date, r.tool_name, r.coworker?.name, requesterName(r), r.quantity, r.unit_price, lineTotal(r), r.status, r.handover_date]),
    ]);

  const maxMonth = Math.max(1, ...stats.byMonth.map((m) => m.count));

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Reporting</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            {rows.length} request{rows.length !== 1 ? "s" : ""} in the selected period
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["month", "This month"],
            ["90", "Last 90 days"],
            ["year", "This year"],
            ["all", "All time"],
          ].map(([k, label]) => (
            <button key={k} onClick={() => preset(k as "month" | "90" | "year" | "all")} className={`${btnGhost} !px-3 !py-1.5`}>
              {label}
            </button>
          ))}
          <input type="date" value={from ?? ""} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} !w-auto`} />
          <span className="text-[#4A5568] text-sm">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} !w-auto`} />
          <button onClick={exportCsv} disabled={rows.length === 0} className={btnGhost}>
            <Download size={16} /> Export
          </button>
          <button onClick={() => load()} className="p-2 rounded-md border border-[#E2E8F0] hover:bg-gray-50 text-[#4A5568]" title="Refresh">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <div className={errorBox}>{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Total requests" value={String(rows.length)} />
        <Card label="Open (not yet delivered)" value={String(stats.open)} accent />
        <Card
          label="Spend (excl. rejected/cancelled)"
          value={formatMoney(stats.spend)}
          hint={stats.missingPrice > 0 ? `${stats.missingPrice} request(s) have no price` : undefined}
        />
        <Card
          label="Avg. time to deliver"
          value={stats.avgLead === null ? "—" : `${stats.avgLead.toFixed(1)} days`}
          hint="Request date → handover date"
        />
      </div>

      {/* By status */}
      <Panel title="By status">
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {REQUEST_STATUSES.map((s) => {
            const c = STATUS_COLORS[s as RequestStatus];
            return (
              <div key={s} className={`rounded-md border px-3 py-2 ${c.bg} ${c.border}`}>
                <div className={`text-xs font-medium ${c.text}`}>{s}</div>
                <div className="text-xl font-semibold text-[#1A202C] mt-0.5">{stats.byStatus[s] ?? 0}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* By month */}
      <Panel title="By month">
        {stats.byMonth.length === 0 ? (
          <div className="p-6 text-sm text-[#4A5568]">No data</div>
        ) : (
          <div className="p-5 space-y-2">
            {stats.byMonth.map((m) => (
              <div key={m.month} className="flex items-center gap-3 text-sm">
                <div className="w-20 text-[#4A5568] shrink-0">{format(new Date(m.month + "-01"), "MMM yyyy")}</div>
                <div className="flex-1 bg-[#F1F5F9] rounded h-5 overflow-hidden">
                  <div className="bg-[#0058A3] h-full" style={{ width: `${(m.count / maxMonth) * 100}%` }} />
                </div>
                <div className="w-10 text-right font-medium">{m.count}</div>
                <div className="w-32 text-right text-[#4A5568]">{formatMoney(m.spend)}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GroupTable title="By requester" rows={stats.byRequester} />
        <GroupTable title="By coworker" rows={stats.byCoworker} />
      </div>
    </div>
  );
}

function Card({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm">
      <div className="text-sm text-[#4A5568]">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-[#0058A3]" : "text-[#1A202C]"}`}>{value}</div>
      {hint && <div className="text-xs text-[#718096] mt-1">{hint}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0]">
        <h2 className="font-semibold text-[#1A202C]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: Group[] }) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-[#4A5568]">No data</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-[#4A5568]">Name</th>
              <th className="text-right px-4 py-2.5 font-medium text-[#4A5568]">Requests</th>
              <th className="text-right px-4 py-2.5 font-medium text-[#4A5568]">Qty</th>
              <th className="text-right px-4 py-2.5 font-medium text-[#4A5568]">Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-[#F8FAFC]">
                <td className="px-4 py-2.5 text-[#1A202C]">{r.name}</td>
                <td className="px-4 py-2.5 text-right font-medium">{r.count}</td>
                <td className="px-4 py-2.5 text-right text-[#4A5568]">{r.qty}</td>
                <td className="px-4 py-2.5 text-right text-[#4A5568] whitespace-nowrap">{formatMoney(r.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
