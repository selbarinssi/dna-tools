"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Request, Profile, RequestStatus } from "@/types";
import { STATUS_COLORS } from "@/lib/constants";
import { RefreshCw } from "lucide-react";

interface Stats {
  byStatus: Record<string, number>;
  byRequester: { name: string; count: number; totalQty: number }[];
  byCoworker: { name: string; count: number; totalQty: number }[];
  totalRequests: number;
  totalQuantity: number;
  openRequests: number;
}

export default function ReportingDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("requests")
      .select(
        `
        id,
        status,
        quantity,
        unit_price,
        requester:profiles!requested_by (id, full_name, email),
        coworker:coworkers (id, name)
      `
      );

    if (error) {
      console.error("Reporting load error:", error);
      setLoading(false);
      return;
    }

    const requests = (data as any[]) || [];

    const byStatus: Record<string, number> = {};
    const requesterMap = new Map<string, { name: string; count: number; totalQty: number }>();
    const coworkerMap = new Map<string, { name: string; count: number; totalQty: number }>();

    let totalQuantity = 0;
    let openRequests = 0;

    const openStatuses = new Set([
      "Submitted",
      "Under Review",
      "Ordered",
      "Received",
      "Delivered",
    ]);

    for (const r of requests) {
      // Status
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;

      totalQuantity += r.quantity || 0;
      if (openStatuses.has(r.status)) openRequests += 1;

      // Requester
      const requesterName =
        r.requester?.full_name || r.requester?.email || "Unknown";
      const requesterKey = r.requester?.id || "unknown";
      const existingReq = requesterMap.get(requesterKey) || {
        name: requesterName,
        count: 0,
        totalQty: 0,
      };
      existingReq.count += 1;
      existingReq.totalQty += r.quantity || 0;
      requesterMap.set(requesterKey, existingReq);

      // Coworker
      const coworkerName = r.coworker?.name || "Unknown";
      const coworkerKey = r.coworker?.id || "unknown";
      const existingCw = coworkerMap.get(coworkerKey) || {
        name: coworkerName,
        count: 0,
        totalQty: 0,
      };
      existingCw.count += 1;
      existingCw.totalQty += r.quantity || 0;
      coworkerMap.set(coworkerKey, existingCw);
    }

    setStats({
      byStatus,
      byRequester: Array.from(requesterMap.values()).sort(
        (a, b) => b.count - a.count
      ),
      byCoworker: Array.from(coworkerMap.values()).sort(
        (a, b) => b.count - a.count
      ),
      totalRequests: requests.length,
      totalQuantity,
      openRequests,
    });

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading && !stats) {
    return (
      <div className="p-12 text-center text-[#4A5568]">Loading reports…</div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Reporting</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            Overview of all tool requests
          </p>
        </div>
        <button
          onClick={() => loadStats()}
          className="p-2 rounded-md border border-[#E2E8F0] hover:bg-gray-50 text-[#4A5568]"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm">
          <div className="text-sm text-[#4A5568]">Total Requests</div>
          <div className="text-3xl font-semibold text-[#1A202C] mt-1">
            {stats.totalRequests}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm">
          <div className="text-sm text-[#4A5568]">Open Requests</div>
          <div className="text-3xl font-semibold text-[#0058A3] mt-1">
            {stats.openRequests}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm">
          <div className="text-sm text-[#4A5568]">Total Quantity</div>
          <div className="text-3xl font-semibold text-[#1A202C] mt-1">
            {stats.totalQuantity}
          </div>
        </div>
      </div>

      {/* By Status */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="font-semibold text-[#1A202C]">By Status</h2>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(stats.byStatus)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => {
              const colors =
                STATUS_COLORS[status as RequestStatus] ||
                STATUS_COLORS.Submitted;
              return (
                <div
                  key={status}
                  className={`rounded-md border px-3 py-2 ${colors.bg} ${colors.border}`}
                >
                  <div className={`text-xs font-medium ${colors.text}`}>
                    {status}
                  </div>
                  <div className="text-xl font-semibold text-[#1A202C] mt-0.5">
                    {count}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Requester */}
        <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0]">
            <h2 className="font-semibold text-[#1A202C]">By Requester</h2>
          </div>
          {stats.byRequester.length === 0 ? (
            <div className="p-6 text-sm text-[#4A5568]">No data</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-[#4A5568]">
                    Name
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-[#4A5568]">
                    Requests
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-[#4A5568]">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {stats.byRequester.map((r) => (
                  <tr key={r.name} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 text-[#1A202C]">{r.name}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {r.count}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#4A5568]">
                      {r.totalQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By Coworker */}
        <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0]">
            <h2 className="font-semibold text-[#1A202C]">By Coworker</h2>
          </div>
          {stats.byCoworker.length === 0 ? (
            <div className="p-6 text-sm text-[#4A5568]">No data</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-[#4A5568]">
                    Name
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-[#4A5568]">
                    Requests
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-[#4A5568]">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {stats.byCoworker.map((c) => (
                  <tr key={c.name} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 text-[#1A202C]">{c.name}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {c.count}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#4A5568]">
                      {c.totalQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
