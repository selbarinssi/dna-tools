"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Request, Profile, RequestStatus } from "@/types";
import StatusBadge from "./StatusBadge";
import RequestForm from "./RequestForm";
import { Plus, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export default function RequestsList() {
  const supabase = createClient();
  const [requests, setRequests] = useState<Request[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    setLoading(true);

    // Current user profile
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (profile) setCurrentUser(profile as Profile);
    }

    // Requests with joins
    let query = supabase
      .from("requests")
      .select(
        `
        *,
        requester:profiles!requested_by (id, full_name, email, role),
        coworker:coworkers (id, name, team)
      `
      )
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error loading requests:", error);
    } else {
      setRequests((data as Request[]) || []);
    }

    setLoading(false);
  }, [supabase, statusFilter]);

  useEffect(() => {
    loadData();

    // Realtime subscription
    const channel = supabase
      .channel("requests-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requests" },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const handleStatusChange = async (id: string, newStatus: RequestStatus) => {
    if (!currentUser || currentUser.role !== "admin") return;

    const { error } = await supabase
      .from("requests")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Status update failed:", error);
      return;
    }

    // Optimistic update
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );
  };

  const isAdmin = currentUser?.role === "admin";
  const canCreate =
    currentUser?.role === "admin" || currentUser?.role === "team_leader";

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">
            Tool Requests
          </h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
            {statusFilter !== "all" ? ` · filtered by ${statusFilter}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
          >
            <option value="all">All statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="Under Review">Under Review</option>
            <option value="Ordered">Ordered</option>
            <option value="Received">Received</option>
            <option value="Delivered">Delivered</option>
            <option value="Closed">Closed</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <button
            onClick={() => loadData()}
            className="p-2 rounded-md border border-[#E2E8F0] hover:bg-gray-50 text-[#4A5568]"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>

          {canCreate && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#0058A3] hover:bg-[#003D73] text-white text-sm font-medium rounded-md transition"
            >
              <Plus size={18} />
              New Request
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading && requests.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">
            No requests yet.
            {canCreate && " Create the first one!"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Tool
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Coworker
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Requested by
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Qty
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Supplier
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 whitespace-nowrap text-[#4A5568]">
                      {req.request_date
                        ? format(new Date(req.request_date), "dd MMM yyyy")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#1A202C]">
                        {req.tool_name}
                      </div>
                      {req.reference && (
                        <div className="text-xs text-[#718096]">
                          {req.reference}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[#1A202C]">
                        {req.coworker?.name ?? "—"}
                      </div>
                      {req.coworker?.team && (
                        <div className="text-xs text-[#718096]">
                          {req.coworker.team}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568]">
                      {req.requester?.full_name ||
                        req.requester?.email ||
                        "—"}
                    </td>
                    <td className="px-4 py-3 text-center">{req.quantity}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          value={req.status}
                          onChange={(e) =>
                            handleStatusChange(
                              req.id,
                              e.target.value as RequestStatus
                            )
                          }
                          className="text-xs border border-[#E2E8F0] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#0058A3]"
                        >
                          <option value="Submitted">Submitted</option>
                          <option value="Under Review">Under Review</option>
                          <option value="Ordered">Ordered</option>
                          <option value="Received">Received</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Closed">Closed</option>
                          <option value="Rejected">Rejected</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      ) : (
                        <StatusBadge status={req.status} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568]">{req.supplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create form modal */}
      <RequestForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={loadData}
        currentUser={currentUser}
      />
    </div>
  );
}
