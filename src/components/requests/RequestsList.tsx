"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coworker, Profile, Request } from "@/types";
import { Upload } from "lucide-react";
import { importRequestsFromFile } from "@/lib/importRequests";
import {
  EMPTY_FILTERS,
  REQUEST_SELECT,
  applyFilters,
  fetchAllRows,
  formatMoney,
  hasActiveFilters,
  lineTotal,
  requesterName,
  type RequestFilters,
} from "@/lib/requests";
import { PAGE_SIZE, REQUEST_STATUSES } from "@/lib/constants";
import { downloadCsv } from "@/lib/csv";
import { inputClass, btnPrimary, btnGhost, errorBox } from "@/components/ui/styles";
import StatusBadge from "./StatusBadge";
import RequestForm from "./RequestForm";
import RequestDetail from "./RequestDetail";
import { Plus, RefreshCw, Search, Download, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format } from "date-fns";

type SortCol = "request_date" | "tool_name" | "quantity" | "status" | "handover_date";

const fmt = (d: string | null) => (d ? format(new Date(d), "dd/MM/yyyy") : "—");

function SortHead({
  col,
  sort,
  onToggle,
  children,
}: {
  col: SortCol;
  sort: { col: SortCol; asc: boolean };
  onToggle: (c: SortCol) => void;
  children: React.ReactNode;
}) {
  return (
    <th className="text-left px-4 py-3 font-medium text-[#4A5568] whitespace-nowrap">
      <button onClick={() => onToggle(col)} className="inline-flex items-center gap-1 hover:text-[#0058A3]">
        {children}
        {sort.col === col && (sort.asc ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
      </button>
    </th>
  );
}

export default function RequestsList() {
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<Request[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ col: SortCol; asc: boolean }>({ col: "request_date", asc: false });
  const [filters, setFilters] = useState<RequestFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [coworkers, setCoworkers] = useState<Pick<Coworker, "id" | "name">[]>([]);
  const [requesters, setRequesters] = useState<Pick<Profile, "id" | "full_name" | "email">[]>([]);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // --- one-time lookups (user, coworkers, requesters) ---
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (profile) setCurrentUser(profile as Profile);
      }
      const [{ data: cw }, { data: pr }] = await Promise.all([
        supabase.from("coworkers").select("id, name").order("name"),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
      ]);
      setCoworkers(cw ?? []);
      setRequesters(pr ?? []);
    })();
  }, [supabase]);

  // --- debounce the search box ---
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput }));
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // --- load one page ---
  const reqCounter = useRef(0);
  const loadData = useCallback(async () => {
    const myCall = ++reqCounter.current;
    setLoading(true);

    let query = supabase.from("requests").select(REQUEST_SELECT, { count: "exact" });
    query = applyFilters(query, filters);
    query = query.order(sort.col, { ascending: sort.asc, nullsFirst: false });
    if (sort.col !== "request_date") query = query.order("request_date", { ascending: false });
    query = query.order("created_at", { ascending: false });
    const from = page * PAGE_SIZE;
    const { data, error: err, count } = await query.range(from, from + PAGE_SIZE - 1);

    if (myCall !== reqCounter.current) return; // a newer call is in flight
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setRequests((data as unknown as Request[]) ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [supabase, filters, sort, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- realtime: subscribe once, always call the latest loader ---
  const loadRef = useRef(loadData);
  useEffect(() => {
    loadRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("requests-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => loadRef.current(), 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  
    const handleImportRequests = async (file: File) => {
    if (currentUser?.role !== "admin") return;
    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      const result = await importRequestsFromFile(supabase, file);
      const skipText =
        result.skipped.length > 0
          ? ` · ${result.skipped.length} skipped: ` +
            result.skipped
              .slice(0, 8)
              .map((s) => `row ${s.row} (${s.reason})`)
              .join("; ") +
            (result.skipped.length > 8 ? "…" : "")
          : "";
      setImportMsg(`Imported ${result.imported}${skipText}`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };
  // --- helpers ---
  const updateFilter = (patch: Partial<RequestFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };
  const clearFilters = () => {
    setSearchInput("");
    setFilters(EMPTY_FILTERS);
    setPage(0);
  };
  const toggleSort = (col: SortCol) => {
    setSort((s) => (s.col === col ? { col, asc: !s.asc } : { col, asc: col === "tool_name" }));
    setPage(0);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllRows<Request>((from, to) => {
        let q = supabase.from("requests").select(REQUEST_SELECT);
        q = applyFilters(q, filters);
        return q
          .order("request_date", { ascending: false })
          .order("id")
          .range(from, to) as unknown as PromiseLike<{ data: Request[] | null; error: { message: string } | null }>;
      });
      downloadCsv(`tool-requests-${format(new Date(), "yyyy-MM-dd")}.csv`, [
        ["Request date", "Tool", "Référence", "Description", "Coworker", "Job Type", "TL", "Requested by", "Supplier", "Product link", "Qty", "Unit price", "Total", "Status", "Rejection reason", "Handover date", "Note"],
        ...rows.map((r) => [
          r.request_date, r.tool_name, r.reference, r.description, r.coworker?.name, r.coworker?.job_type, r.coworker?.tl,
          requesterName(r), r.supplier, r.supplier_url, r.quantity, r.unit_price, lineTotal(r),
          r.status, r.rejection_reason, r.handover_date, r.note,
        ]),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
    setExporting(false);
  };

  const canCreate = currentUser?.role === "admin" || currentUser?.role === "team_leader";
  const deactivated = currentUser && !currentUser.is_active;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const onlyMine = !!currentUser && filters.requesterId === currentUser.id;

  return (
    <div className="space-y-5">
      {/* Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Tool Requests</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            {total} request{total !== 1 ? "s" : ""}
            {hasActiveFilters(filters) ? " match your filters" : ""}
          </p>
        </div>
                <div className="flex items-center gap-3">
          <button onClick={exportCsv} disabled={exporting} className={btnGhost} title="Export the filtered list for Excel">
            <Download size={16} />
            {exporting ? "Exporting…" : "Export"}
          </button>

          {currentUser?.role === "admin" && (
            <label className={`${btnGhost} cursor-pointer inline-flex items-center gap-2`}>
              <Upload size={16} />
              {importing ? "Importing…" : "Import Excel"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportRequests(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          <button onClick={() => loadData()} className="p-2 rounded-md border border-[#E2E8F0] hover:bg-gray-50 text-[#4A5568]" title="Refresh">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          {canCreate && !deactivated && (
            <button onClick={() => setShowForm(true)} className={btnPrimary}>
              <Plus size={18} />
              New Request
            </button>
          )}
        </div>
      </div>

      {deactivated && (
        <div className={errorBox}>Your account is deactivated. Please contact an admin.</div>
      )}

      {/* Filters */}
<div className="bg-white rounded-lg border border-[#E2E8F0] p-4 space-y-3">
  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
    <div className="relative md:col-span-2">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search tool, référence, note…"
        className={`${inputClass} pl-9`}
      />
    </div>
    <select value={filters.status} onChange={(e) => updateFilter({ status: e.target.value })} className={inputClass}>
      <option value="all">All statuses</option>
      {REQUEST_STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
    <select value={filters.coworkerId} onChange={(e) => updateFilter({ coworkerId: e.target.value })} className={inputClass}>
      <option value="all">All coworkers</option>
      {coworkers.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
    <select value={filters.requesterId} onChange={(e) => updateFilter({ requesterId: e.target.value })} className={inputClass}>
      <option value="all">All requesters</option>
      {requesters.map((p) => (
        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
      ))}
    </select>
    <div className="flex items-center gap-2">
      {currentUser && (
        <button
          onClick={() => updateFilter({ requesterId: onlyMine ? "all" : currentUser.id })}
          className={`px-3 py-2 text-sm rounded-md border whitespace-nowrap ${onlyMine ? "bg-[#0058A3] text-white border-[#0058A3]" : "border-[#E2E8F0] text-[#4A5568] hover:bg-gray-50"}`}
        >
          My requests
        </button>
      )}
    </div>
  </div>

  {/* Compact date range + clear */}
  <div className="flex flex-wrap items-center gap-2 text-sm text-[#4A5568]">
    <span className="font-medium">Period</span>
    <input
      type="date"
      value={filters.from}
      onChange={(e) => updateFilter({ from: e.target.value })}
      className={`${inputClass} !w-auto !py-1.5`}
    />
    <span>→</span>
    <input
      type="date"
      value={filters.to}
      onChange={(e) => updateFilter({ to: e.target.value })}
      className={`${inputClass} !w-auto !py-1.5`}
    />
    {hasActiveFilters(filters) && (
      <button onClick={clearFilters} className="inline-flex items-center gap-1 ml-2 text-[#0058A3] hover:underline">
        <X size={14} /> Clear filters
      </button>
    )}
  </div>
</div>

      {error && <div className={errorBox}>{error}</div>}
            {importMsg && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
          {importMsg}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading && requests.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">
            {hasActiveFilters(filters) ? "No requests match these filters." : "No requests yet."}
            {!hasActiveFilters(filters) && canCreate && " Create the first one!"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <SortHead col="request_date" sort={sort} onToggle={toggleSort}>Date</SortHead>
                  <SortHead col="tool_name" sort={sort} onToggle={toggleSort}>Tool</SortHead>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Coworker</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Requested by</th>
                  <SortHead col="quantity" sort={sort} onToggle={toggleSort}>Qty</SortHead>
                  <th className="text-right px-4 py-3 font-medium text-[#4A5568]">Total</th>
                  <SortHead col="status" sort={sort} onToggle={toggleSort}>Status</SortHead>
                  <SortHead col="handover_date" sort={sort} onToggle={toggleSort}>Handover</SortHead>
                </tr>
              </thead>
              <tbody className={`divide-y divide-[#E2E8F0] ${loading ? "opacity-60" : ""}`}>
                {requests.map((req) => {
                  const t = lineTotal(req);
                  return (
                    <tr key={req.id} onClick={() => setSelectedId(req.id)} className="hover:bg-[#F8FAFC] cursor-pointer">
                      <td className="px-4 py-3 whitespace-nowrap text-[#4A5568]">{fmt(req.request_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1A202C]">{req.tool_name}</div>
                        {req.reference && <div className="text-xs text-[#718096]">{req.reference}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[#1A202C]">{req.coworker?.name ?? "—"}</div>
                        {(req.coworker?.job_type || req.coworker?.tl) && (
                          <div className="text-xs text-[#718096]">
                            {[req.coworker.job_type, req.coworker.tl].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#4A5568]">{requesterName(req)}</td>
                      <td className="px-4 py-3 text-center">{req.quantity}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-[#4A5568]">{t === null ? "—" : formatMoney(t)}</td>
                      <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-[#4A5568]">{fmt(req.handover_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0] text-sm text-[#4A5568]">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={`${btnGhost} !px-2 !py-1.5`}>
                <ChevronLeft size={16} />
              </button>
              <span>Page {page + 1} / {totalPages}</span>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className={`${btnGhost} !px-2 !py-1.5`}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <RequestForm open={showForm} onClose={() => setShowForm(false)} onSuccess={loadData} currentUser={currentUser} />
      <RequestDetail requestId={selectedId} currentUser={currentUser} onClose={() => setSelectedId(null)} onChanged={loadData} />
    </div>
  );
}
