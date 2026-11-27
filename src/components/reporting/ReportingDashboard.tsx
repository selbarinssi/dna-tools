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
type CategoryMode = "type" | "sub"; // type = OpEx/CapEx, sub = catalog categories

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

/** Catalog category text */
function rawCategory(
  r: Request,
  tools: Tool[]
): string {
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
}

/** OpEx if category contains CONSUMABLE (any case), else CapEx */
function expenseType(category: string): "OpEx" | "CapEx" {
  return category.toUpperCase().includes("CONSUMABLE") ? "OpEx" : "CapEx";
}

export default function ReportingDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Request[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState("");

  const [categoryMode, setCategoryMode] = useState<CategoryMode>("type");
  const [category, setCategory] = useState("all");
  const [toolQuery, setToolQuery] = useState("");

  const [reqSort, setReqSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });
  const [catSort, setCatSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });
  const [cowSort, setCowSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });

  const [expandLead, setExpandLead] = useState(false);
  const [expandMonth, setExpandMonth] = useState(false);

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

  // Label used for filter + grouping (depends on mode)
  const categoryLabel = useCallback(
    (r: Request): string => {
      const raw = rawCategory(r, tools);
      return categoryMode === "type" ? expenseType(raw) : raw;
    },
    [tools, categoryMode]
  );

  const filterOptions = useMemo(() => {
    if (categoryMode === "type") return ["OpEx", "CapEx"];
    const set = new Set<string>();
    for (const r of rows) set.add(rawCategory(r, tools));
    for (const t of tools) if (t.category) set.add(t.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, tools, categoryMode]);

  // Reset filter when switching mode
  useEffect(() => {
    setCategory("all");
  }, [categoryMode]);

  const filtered = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && categoryLabel(r) !== category) return false;
      if (q && !(r.tool_name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, category, toolQuery, categoryLabel]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let open = 0;
    let spend = 0;
    let missingPrice = 0;
    let leadSum = 0;
    let leadCount = 0;
    const leadBuckets = new Map<number, number>();
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

    const CAP = 14; // shorter default range; expand shows up to 30+
    const leadCap = expandLead ? 30 : CAP;
    const leadDistribution: { days: string; dayNum: number; count: number }[] = [];
    for (let d = 0; d <= Math.min(leadMax, leadCap); d++) {
      const count = leadBuckets.get(d) || 0;
      if (!expandLead && count === 0) continue;
      leadDistribution.push({
        days: d === 0 ? "Same day" : d === 1 ? "1 day" : `${d} days`,
        dayNum: d,
        count,
      });
    }
    if (leadMax > leadCap) {
      let over = 0;
      for (const [d, c] of leadBuckets) if (d > leadCap) over += c;
      if (over > 0) {
        leadDistribution.push({
          days: `${leadCap}+ days`,
          dayNum: leadCap + 1,
          count: over,
        });
      }
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
      byRequester: groupBy(filtered, (r) => r.requester?.id ?? "unknown", requesterName),
      byCategory: groupBy(filtered, (r) => categoryLabel(r), (r) => categoryLabel(r)),
      byCoworker: groupBy(
        filtered,
        (r) => r.coworker?.id ?? "unknown",
        (r) => r.coworker?.name ?? "Unknown"
      ),
    };
  }, [filtered, categoryLabel, expandLead]);

  const byRequesterSorted = useMemo(
    () => sortGroups(stats.byRequester, reqSort.key, reqSort.dir),
    [stats.byRequester, reqSort]
  );
  const byCategorySorted = useMemo(
    () => sortGroups(stats.byCategory, catSort.key, catSort.dir),
    [stats.byCategory, catSort]
  );
  const byCoworkerSorted = useMemo(
    () => sortGroups(stats.byCoworker, cowSort.key, cowSort.dir),
    [stats.byCoworker, cowSort]
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
        "Type",
        "Coworker",
        "Requested by",
        "Qty",
        "Unit price",
        "Total",
        "Status",
        "Handover date",
        "Days to deliver",
      ],
      ...filtered.map((r) => {
        const raw = rawCategory(r, tools);
        return [
          r.request_date,
          r.tool_name,
          raw,
          expenseType(raw),
          r.coworker?.name,
          requesterName(r),
          r.quantity,
          r.unit_price,
          lineTotal(r),
          r.status,
          r.handover_date,
          leadDays(r),
        ];
      }),
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
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Reporting</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            {filtered.length} request{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== rows.length
              ? ` (of ${rows.length} in period)`
              : " in the selected period"}
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
            className={`${inputClass} !w-auto !py-1.5`}
          />
          <span className="text-[#4A5568] text-sm">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputClass} !w-auto !py-1.5`}
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

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] px-4 py-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[#718096] mb-1">Group by</label>
          <div className="inline-flex rounded-md border border-[#E2E8F0] overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setCategoryMode("type")}
              className={`px-3 py-1.5 ${
                categoryMode === "type"
                  ? "bg-[#0058A3] text-white"
                  : "bg-white text-[#4A5568] hover:bg-gray-50"
              }`}
            >
              Type (OpEx / CapEx)
            </button>
            <button
              type="button"
              onClick={() => setCategoryMode("sub")}
              className={`px-3 py-1.5 border-l border-[#E2E8F0] ${
                categoryMode === "sub"
                  ? "bg-[#0058A3] text-white"
                  : "bg-white text-[#4A5568] hover:bg-gray-50"
              }`}
            >
              Subcategories
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#718096] mb-1">
            {categoryMode === "type" ? "Type" : "Category"}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${inputClass} !w-auto min-w-[140px] !py-1.5`}
          >
            <option value="all">All</option>
            {filterOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-[#718096] mb-1">Tool name</label>
          <input
            type="search"
            value={toolQuery}
            onChange={(e) => setToolQuery(e.target.value)}
            placeholder="Filter by tool name…"
            className={`${inputClass} !py-1.5`}
          />
        </div>

        {(category !== "all" || toolQuery.trim()) && (
          <button
            type="button"
            className={`${btnGhost} !py-1.5`}
            onClick={() => {
              setCategory("all");
              setToolQuery("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && <div className={errorBox}>{error}</div>}

      {/* KPI cards — tighter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Total requests" value={String(filtered.length)} />
        <Card label="Open" value={String(stats.open)} accent />
        <Card
          label="Spend"
          value={formatMoney(stats.spend)}
          hint={
            stats.missingPrice > 0
              ? `${stats.missingPrice} without price`
              : undefined
          }
        />
        <Card
          label="Avg. time to deliver"
          value={stats.avgLead === null ? "—" : `${stats.avgLead.toFixed(1)} d`}
          hint={stats.leadCount ? `${stats.leadCount} delivered` : undefined}
        />
      </div>

      {/* Time to deliver — compact */}
      <Panel title="Time to deliver" dense>
        {stats.leadDistribution.length === 0 ? (
          <div className="px-4 py-3 text-sm text-[#4A5568]">No handover data in selection.</div>
        ) : (
          <div className="px-4 py-3 space-y-1.5">
            <div
              className={
                expandLead ? "space-y-1.5" : "space-y-1.5 max-h-40 overflow-y-auto pr-1"
              }
            >
              {stats.leadDistribution.map((d) => (
                <div key={d.dayNum} className="flex items-center gap-2 text-sm">
                  <div className="w-20 text-[#4A5568] shrink-0 text-xs">{d.days}</div>
                  <div className="flex-1 bg-[#F1F5F9] rounded h-3.5 overflow-hidden">
                    <div
                      className="bg-[#FFDA1A] h-full"
                      style={{ width: `${(d.count / maxLead) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 text-right font-medium text-xs">{d.count}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs text-[#0058A3] hover:underline"
                onClick={() => setExpandLead((v) => !v)}
              >
                {expandLead ? "Show less" : "Expand (all days)"}
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* Status + Month side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="By status" dense>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {REQUEST_STATUSES.map((s) => {
              const c = STATUS_COLORS[s as RequestStatus];
              return (
                <div key={s} className={`rounded-md border px-2.5 py-1.5 ${c.bg} ${c.border}`}>
                  <div className={`text-[11px] font-medium ${c.text}`}>{s}</div>
                  <div className="text-lg font-semibold text-[#1A202C]">
                    {stats.byStatus[s] ?? 0}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="By month" dense>
          {stats.byMonth.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#4A5568]">No data</div>
          ) : (
            <div className="px-4 py-3 space-y-1.5">
              <div
                className={
                  expandMonth ? "space-y-1.5" : "space-y-1.5 max-h-40 overflow-y-auto pr-1"
                }
              >
                {stats.byMonth.map((m) => (
                  <div key={m.month} className="flex items-center gap-2 text-sm">
                    <div className="w-16 text-[#4A5568] shrink-0 text-xs">
                      {format(new Date(m.month + "-01"), "MMM yy")}
                    </div>
                    <div className="flex-1 bg-[#F1F5F9] rounded h-3.5 overflow-hidden">
                      <div
                        className="bg-[#0058A3] h-full"
                        style={{ width: `${(m.count / maxMonth) * 100}%` }}
                      />
                    </div>
                    <div className="w-7 text-right font-medium text-xs">{m.count}</div>
                    <div className="w-24 text-right text-[#4A5568] text-xs">
                      {formatMoney(m.spend)}
                    </div>
                  </div>
                ))}
              </div>
              {stats.byMonth.length > 5 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-[#0058A3] hover:underline"
                    onClick={() => setExpandMonth((v) => !v)}
                  >
                    {expandMonth ? "Show less" : "Expand"}
                  </button>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SortableGroupTable
          title="By requester"
          rows={byRequesterSorted}
          sort={reqSort}
          onSort={(key) => toggleSort(reqSort, setReqSort, key)}
        />
        <SortableGroupTable
          title={categoryMode === "type" ? "By type (OpEx / CapEx)" : "By subcategory"}
          rows={byCategorySorted}
          sort={catSort}
          onSort={(key) => toggleSort(catSort, setCatSort, key)}
        />
      </div>

      <SortableGroupTable
        title="By coworker"
        rows={byCoworkerSorted}
        sort={cowSort}
        onSort={(key) => toggleSort(cowSort, setCowSort, key)}
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
    <div className="bg-white rounded-lg border border-[#E2E8F0] px-4 py-3 shadow-sm">
      <div className="text-xs text-[#4A5568]">{label}</div>
      <div
        className={`text-xl font-semibold mt-0.5 ${accent ? "text-[#0058A3]" : "text-[#1A202C]"}`}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-[#718096] mt-0.5">{hint}</div>}
    </div>
  );
}

function Panel({
  title,
  children,
  dense,
}: {
  title: string;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className={`border-b border-[#E2E8F0] ${dense ? "px-4 py-2.5" : "px-5 py-4"}`}>
        <h2 className="font-semibold text-[#1A202C] text-sm">{title}</h2>
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
}: {
  title: string;
  rows: Group[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const head = (key: SortKey, label: string, align: "left" | "right") => {
    const active = sort.key === key;
    return (
      <th
        className={`${
          align === "left" ? "text-left" : "text-right"
        } px-3 py-2 font-medium text-[#4A5568] cursor-pointer select-none hover:text-[#0058A3] text-xs`}
        onClick={() => onSort(key)}
      >
        {label}
        {active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  };

  return (
    <Panel title={title} dense>
      {rows.length === 0 ? (
        <div className="px-4 py-3 text-sm text-[#4A5568]">No data</div>
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
                <td className="px-3 py-1.5 text-[#1A202C]">{r.name}</td>
                <td className="px-3 py-1.5 text-right font-medium">{r.count}</td>
                <td className="px-3 py-1.5 text-right text-[#4A5568]">{r.qty}</td>
                <td className="px-3 py-1.5 text-right text-[#4A5568] whitespace-nowrap">
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
