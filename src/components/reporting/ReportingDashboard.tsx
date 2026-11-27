"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Request, RequestStatus, Tool } from "@/types";
import { NO_SPEND_STATUSES, OPEN_STATUSES, REQUEST_STATUSES, STATUS_COLORS } from "@/lib/constants";
import { fetchAllRows, formatMoney, lineTotal, requesterName } from "@/lib/requests";
import { downloadCsv } from "@/lib/csv";
import { inputClass, btnGhost, errorBox } from "@/components/ui/styles";
import { RefreshCw, Download } from "lucide-react";
import { differenceInCalendarDays, format, startOfMonth, startOfYear, subDays } from "date-fns";

const SELECT = `
  id, status, quantity, unit_price, request_date, handover_date, tool_name, reference, tool_id,
  requester:profiles!requested_by (id, full_name, email),
  coworker:coworkers (id, name),
  tool:tools (id, name, category, reference)
`;

interface Group {
  key: string;
  name: string;
  count: number;
  qty: number;
  spend: number;
}

type SortKey = "name" | "count" | "qty" | "spend";
type SortDir = "asc" | "desc";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function groupBy(
  rows: Request[],
  keyFn: (r: Request) => string,
  nameFn: (r: Request) => string
): Group[] {
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

function sortGroups(rows: Group[], key: SortKey, dir: SortDir): Group[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return mul * a.name.localeCompare(b.name);
    return mul * ((a[key] as number) - (b[key] as number));
  });
}

function leadDays(r: Request): number | null {
  if (!r.handover_date) return null;
  if (r.status !== "Delivered" && r.status !== "Closed") return null;
  return Math.max(
    0,
    differenceInCalendarDays(new Date(r.handover_date), new Date(r.request_date))
  );
}

export default function ReportingDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Request[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState("");

  // Extra filters
  const [category, setCategory] = useState("all");
  const [toolQuery, setToolQuery] = useState("");

  // Sortable tables
  const [reqSort, setReqSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });
  const [catSort, setCatSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });

  useEffect(() => {
    setFrom(iso(startOfYear(new Date())));
  }, []);

  const load = useCallback(async () => {
    if (from === null) return;
    setLoading(true);
    setError(null);
    try {
      const [data, toolsData] = await Promise.all([
        fetchAllRows<Request>((a, b) => {
          let q = supabase.from("requests").select(SELECT);
          if (from) q = q.gte("request_date", from);
          if (to) q = q.lte("request_date", to);
          return q
            .order("request_date", { ascending: false })
            .order("id")
            .range(a, b) as unknown as PromiseLike<{
            data: Request[] | null;
            error: { message: string } | null;
          }>;
        }),
        supabase.from("tools").select("id, name, category, reference"),
      ]);
      setRows(data);
      setTools((toolsData.data as Tool[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
    setLoading(false);
  }, [supabase, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // Category from joined tool, or catalog match by reference/name
  const categoryOf = useCallback(
    (r: Request): string => {
      const joined = (r as Request & { tool?: { category?: string | null } }).tool;
      if (joined?.category) return joined.category;
      if (r.reference) {
        const t = tools.find(
          (x) => x.reference && x.reference.toLowerCase() === r.reference!.toLowerCase()
        );
        if (t?.category) return t.category;
      }
      const t2 = tools.find(
        (x) => x.name.toLowerCase() === (r.tool_name || "").toLowerCase()
      );
      return t2?.category || "Uncategorized";
    },
    [tools]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(categoryOf(r));
    for (const t of tools) if (t.category) set.add(t.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, tools, categoryOf]);

  const filtered = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && categoryOf(r) !== category) return false;
      if (q && !(r.tool_name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, category, toolQuery, categoryOf]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let open = 0;
    let spend = 0;
    let missingPrice = 0;
    let leadSum = 0;
    let leadCount = 0;
    const leadBuckets = new Map<number, number>(); // days → count
    let leadMax = 0;

    for (const r of filtered) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (OPEN_STATUSES.includes(r.status)) open += 1;
      if (!NO_SPEND_STATUSES.includes(r.status)) {
        const t = lineTotal(r);
        if (t === null) missingPrice += 1;
        else spend += t;
      }
      const d = leadDays(r);
      if (d !== null) {
        leadSum += d;
        leadCount += 1;
        leadBuckets.set(d, (leadBuckets.get(d) || 0) + 1);
        if (d > leadMax) leadMax = d;
      }
    }

    // Build 0..max days series (cap display at 30+, group tail)
    const CAP = 30;
    const leadDistribution: { days: string; dayNum: number; count: number }[] = [];
    for (let d = 0; d <= Math.min(leadMax, CAP); d++) {
      leadDistribution.push({
        days: d === 1 ? "1 day" : `${d} days`,
        dayNum: d,
        count: leadBuckets.get(d) || 0,
      });
    }
    if (leadMax > CAP) {
      let over = 0;
      for (const [d, c] of leadBuckets) if (d > CAP) over += c;
      leadDistribution.push({ days: `${CAP}+ days`, dayNum: CAP + 1, count: over });
    }

    const monthMap = new Map<string, { month: string; count: number; spend: number }>();
    for (const r of filtered) {
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
      leadCount,
      leadDistribution,
      byMonth: Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      byRequester: groupBy(
        filtered,
        (r) => r.requester?.id ?? "unknown",
        requesterName
      ),
      byCategory: groupBy(filtered, (r) => categoryOf(r), (r) => categoryOf(r)),
      byCoworker: groupBy(
        filtered,
        (r) => r.coworker?.id ?? "unknown",
        (r) => r.coworker?.name ?? "Unknown"
      ),
    };
  }, [filtered, categoryOf]);

  const byRequesterSorted = useMemo(
    () => sortGroups(stats.byRequester, reqSort.key, reqSort.dir),
    [stats.byRequester, reqSort]
  );
  const byCategorySorted = useMemo(
    () => sortGroups(stats.byCategory, catSort.key, catSort.dir),
    [stats.byCategory, catSort]
  );

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
      [
        "Request date",
        "Tool",
        "Category",
        "Coworker",
        "Requested by",
        "Qty",
        "Unit price",
        "Total",
        "Status",
        "Handover date",
        "Days to deliver",
      ],
      ...filtered.map((r) => [
        r.request_date,
        r.tool_name,
        categoryOf(r),
        r.coworker?.name,
        requesterName(r),
        r.quantity,
        r.unit_price,
        lineTotal(r),
        r.status,
        r.handover_date,
        leadDays(r),
      ]),
    ]);

  const maxMonth = Math.max(1, ...stats.byMonth.map((m) => m.count));
  const maxLead = Math.max(1, ...stats.leadDistribution.map((d) => d.count));

  const toggleSort = (
    current: { key: SortKey; dir: SortDir },
    set: (v: { key: SortKey; dir: SortDir }) => void,
    key: SortKey
  ) => {
    if (current.key === key) {
      set({ key, dir: current.dir === "asc" ? "desc" : "asc" });
    } else {
      set({ key, dir: key === "name" ? "asc" : "desc" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Reporting</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            {filtered.length} request{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== rows.length ? ` (of ${rows.length} in period)` : " in the selected period"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["month", "This month"],
              ["90", "Last 90 days"],
              ["year", "This year"],
              ["all", "All time"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => preset(k)}
              className={`${btnGhost} !px-3 !py-1.5`}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            value={from ?? ""}
            onChange={(e) => setFrom(e.target.value)}
            className={`${inputClass} !w-auto`}
          />
          <span className="text-[#4A5568] text-sm">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputClass} !w-auto`}
          />
          <button onClick={exportCsv} disabled={filtered.length === 0} className={btnGhost}>
            <Download size={16} /> Export
          </button>
          <button
            onClick={() => load()}
            className="p-2 rounded-md border border-[#E2E8F0] hover:bg-gray-50 text-[#4A5568]"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Extra filters */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[#718096] mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${inputClass} !w-auto min-w-[160px]`}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-[#718096] mb-1">Tool name</label>
          <input
            type="search"
            value={toolQuery}
            onChange={(e) => setToolQuery(e.target.value)}
            placeholder="Filter by tool name…"
            className={inputClass}
          />
        </div>
        {(category !== "all" || toolQuery.trim()) && (
          <button
            type="button"
            className={`${btnGhost} !py-2`}
            onClick={() => {
              setCategory("all");
              setToolQuery("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <div className={errorBox}>{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Total requests" value={String(filtered.length)} />
        <Card label="Open (not yet delivered)" value={String(stats.open)} accent />
        <Card
          label="Spend (excl. rejected/cancelled)"
          value={formatMoney(stats.spend)}
          hint={
            stats.missingPrice > 0
              ? `${stats.missingPrice} request(s) have no price`
              : undefined
          }
        />
        <Card
          label="Avg. time to deliver"
          value={stats.avgLead === null ? "—" : `${stats.avgLead.toFixed(1)} days`}
          hint={
            stats.leadCount
              ? `${stats.leadCount} delivered with handover date`
              : "Request date → handover date"
          }
        />
      </div>

      {/* Time-to-deliver distribution */}
      <Panel title="Time to deliver (days from request → handover)">
        {stats.leadDistribution.every((d) => d.count === 0) ? (
          <div className="p-6 text-sm text-[#4A5568]">
            No delivered/closed requests with a handover date in this selection.
          </div>
        ) : (
          <div className="p-5 space-y-2">
            {stats.leadDistribution.map((d) => (
              <div key={d.dayNum} className="flex items-center gap-3 text-sm">
                <div className="w-24 text-[#4A5568] shrink-0">{d.days}</div>
                <div className="flex-1 bg-[#F1F5F9] rounded h-5 overflow-hidden">
                  <div
                    className="bg-[#FFDA1A] h-full"
                    style={{ width: `${(d.count / maxLead) * 100}%` }}
                  />
                </div>
                <div className="w-12 text-right font-medium">{d.count}</div>
              </div>
            ))}
            <p className="text-xs text-[#718096] pt-2">
              Same-day delivery = 0 days. Only Delivered / Closed with a handover date.
            </p>
          </div>
        )}
      </Panel>

      <Panel title="By status">
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {REQUEST_STATUSES.map((s) => {
            const c = STATUS_COLORS[s as RequestStatus];
            return (
              <div key={s} className={`rounded-md border px-3 py-2 ${c.bg} ${c.border}`}>
                <div className={`text-xs font-medium ${c.text}`}>{s}</div>
                <div className="text-xl font-semibold text-[#1A202C] mt-0.5">
                  {stats.byStatus[s] ?? 0}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="By month">
        {stats.byMonth.length === 0 ? (
          <div className="p-6 text-sm text-[#4A5568]">No data</div>
        ) : (
          <div className="p-5 space-y-2">
            {stats.byMonth.map((m) => (
              <div key={m.month} className="flex items-center gap-3 text-sm">
                <div className="w-20 text-[#4A5568] shrink-0">
                  {format(new Date(m.month + "-01"), "MMM yyyy")}
                </div>
                <div className="flex-1 bg-[#F1F5F9] rounded h-5 overflow-hidden">
                  <div
                    className="bg-[#0058A3] h-full"
                    style={{ width: `${(m.count / maxMonth) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right font-medium">{m.count}</div>
                <div className="w-32 text-right text-[#4A5568]">{formatMoney(m.spend)}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SortableGroupTable
          title="By requester"
          rows={byRequesterSorted}
          sort={reqSort}
          onSort={(key) => toggleSort(reqSort, setReqSort, key)}
        />
        <SortableGroupTable
          title="By item category"
          rows={byCategorySorted}
          sort={catSort}
          onSort={(key) => toggleSort(catSort, setCatSort, key)}
        />
      </div>

      <SortableGroupTable
        title="By coworker"
        rows={sortGroups(stats.byCoworker, "count", "desc")}
        sort={{ key: "count", dir: "desc" }}
        onSort={() => {}}
        disableSort
      />
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm">
      <div className="text-sm text-[#4A5568]">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${accent ? "text-[#0058A3]" : "text-[#1A202C]"}`}
      >
        {value}
      </div>
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

function SortableGroupTable({
  title,
  rows,
  sort,
  onSort,
  disableSort,
}: {
  title: string;
  rows: Group[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  disableSort?: boolean;
}) {
  const head = (key: SortKey, label: string, align: "left" | "right") => {
    const active = sort.key === key;
    return (
      <th
        className={`${align === "left" ? "text-left" : "text-right"} px-4 py-2.5 font-medium text-[#4A5568] ${
          disableSort ? "" : "cursor-pointer select-none hover:text-[#0058A3]"
        }`}
        onClick={() => !disableSort && onSort(key)}
      >
        {label}
        {!disableSort && active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  };

  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-[#4A5568]">No data</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            <tr>
              {head("name", "Name", "left")}
              {head("count", "Requests", "right")}
              {head("qty", "Qty", "right")}
              {head("spend", "Spend", "right")}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-[#F8FAFC]">
                <td className="px-4 py-2.5 text-[#1A202C]">{r.name}</td>
                <td className="px-4 py-2.5 text-right font-medium">{r.count}</td>
                <td className="px-4 py-2.5 text-right text-[#4A5568]">{r.qty}</td>
                <td className="px-4 py-2.5 text-right text-[#4A5568] whitespace-nowrap">
                  {formatMoney(r.spend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
