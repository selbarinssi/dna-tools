"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coworker, Profile, Request, RequestStatus, StatusHistoryEntry } from "@/types";
import { REQUEST_SELECT, formatMoney, lineTotal, requesterName } from "@/lib/requests";
import { STATUS_TRANSITIONS } from "@/lib/constants";
import { inputClass, labelClass, btnPrimary, btnGhost, errorBox } from "@/components/ui/styles";
import StatusBadge from "./StatusBadge";
import { format } from "date-fns";
import { X, Pencil, ExternalLink } from "lucide-react";

interface Props {
  requestId: string | null;
  currentUser: Profile | null;
  onClose: () => void;
  onChanged: () => void;
}

const fmtDate = (d: string | null) => (d ? format(new Date(d), "dd/MM/yyyy") : "—");
const fmtDateTime = (d: string) => format(new Date(d), "dd/MM/yyyy, HH:mm");

export default function RequestDetail({ requestId, currentUser, onClose, onChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [req, setReq] = useState<Request | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    coworker_id: "", tool_name: "", reference: "", description: "", supplier: "",
    supplier_url: "", quantity: "1", unit_price: "", note: "", handover_date: "",
  });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    const [{ data: r, error: e1 }, { data: h }] = await Promise.all([
      supabase.from("requests").select(REQUEST_SELECT).eq("id", requestId).single(),
      supabase
        .from("request_status_history")
        .select("*, changer:profiles!changed_by (full_name, email)")
        .eq("request_id", requestId)
        .order("changed_at", { ascending: false }),
    ]);
    if (e1) setError(e1.message);
    else setReq(r as unknown as Request);
    setHistory((h as unknown as StatusHistoryEntry[]) ?? []);
    setLoading(false);
  }, [supabase, requestId]);

  useEffect(() => {
    setReq(null);
    setHistory([]);
    setEditing(false);
    setRejecting(false);
    setReason("");
    setError(null);
    if (requestId) load();
  }, [requestId, load]);

  const isAdmin = currentUser?.role === "admin";
  const isOwner = !!req && currentUser?.id === req.requested_by;
  const canEdit = !!req && (isAdmin || (isOwner && req.status === "Submitted"));
  const canCancelOwn = !!req && !isAdmin && isOwner && req.status === "Submitted";
  const nextStatuses = req && isAdmin ? STATUS_TRANSITIONS[req.status] : [];

  const startEdit = async () => {
    if (!req) return;
    setForm({
      coworker_id: req.coworker_id,
      tool_name: req.tool_name,
      reference: req.reference ?? "",
      description: req.description ?? "",
      supplier: req.supplier,
      supplier_url: req.supplier_url ?? "",
      quantity: String(req.quantity),
      unit_price: req.unit_price === null ? "" : String(req.unit_price),
      note: req.note ?? "",
      handover_date: req.handover_date ?? "",
    });
    const { data } = await supabase.from("coworkers").select("*").order("name");
    setCoworkers((data as Coworker[]) ?? []);
    setEditing(true);
    setError(null);
  };

  const run = async (fn: () => Promise<{ message: string } | null>) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    await load();
    onChanged();
    return true;
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!req) return;
    const url = form.supplier_url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setError("Product link must start with http:// or https://");
      return;
    }
    const payload: Record<string, unknown> = {
      coworker_id: form.coworker_id,
      tool_name: form.tool_name.trim(),
      reference: form.reference.trim() || null,
      description: form.description.trim() || null,
      supplier: form.supplier.trim() || "Bricoma",
      supplier_url: url || null,
      quantity: Number(form.quantity) || 1,
      unit_price: form.unit_price ? Number(form.unit_price) : null,
      note: form.note.trim() || null,
    };
    if (isAdmin && (req.status === "Delivered" || req.status === "Closed")) {
      payload.handover_date = form.handover_date || null;
    }
    const ok = await run(async () => {
      const { error: err } = await supabase.from("requests").update(payload).eq("id", req.id);
      return err;
    });
    if (ok) setEditing(false);
  };

  const changeStatus = async (to: RequestStatus) => {
    if (!req) return;
    if (to === "Rejected") {
      setRejecting(true);
      return;
    }
    await run(async () => {
      const { error: err } = await supabase.from("requests").update({ status: to }).eq("id", req.id);
      return err;
    });
  };

  const confirmReject = async () => {
    if (!req) return;
    if (!reason.trim()) {
      setError("Please give a reason for rejecting.");
      return;
    }
    const ok = await run(async () => {
      const { error: err } = await supabase
        .from("requests")
        .update({ status: "Rejected", rejection_reason: reason.trim() })
        .eq("id", req.id);
      return err;
    });
    if (ok) {
      setRejecting(false);
      setReason("");
    }
  };

  const cancelOwn = async () => {
    if (!req || !confirm("Cancel this request? This cannot be undone.")) return;
    await run(async () => {
      const { error: err } = await supabase.from("requests").update({ status: "Cancelled" }).eq("id", req.id);
      return err;
    });
  };

  if (!requestId) return null;

  const total = req ? lineTotal(req) : null;
  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#1A202C] truncate">{req?.tool_name ?? "Request"}</h2>
            {req && <StatusBadge status={req.status} className="mt-1" />}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && <div className={errorBox}>{error}</div>}
          {loading && !req && <div className="text-[#4A5568]">Loading…</div>}

          {req && !editing && (
            <>
              {/* Admin actions */}
              {nextStatuses.length > 0 && (
                <div className="rounded-lg border border-[#E2E8F0] p-4 bg-[#F8FAFC]">
                  <div className="text-xs font-medium text-[#4A5568] mb-2">Move this request to…</div>
                  <div className="flex flex-wrap gap-2">
                    {nextStatuses.map((s) => (
                      <button
                        key={s}
                        disabled={busy}
                        onClick={() => changeStatus(s)}
                        className={
                          s === "Rejected" || s === "Cancelled"
                            ? "px-3 py-1.5 text-sm rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-60"
                            : "px-3 py-1.5 text-sm rounded-md border border-[#0058A3] text-[#0058A3] bg-white hover:bg-blue-50 disabled:opacity-60"
                        }
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {rejecting && (
                    <div className="mt-3 space-y-2">
                      <label className={labelClass}>Reason for rejection *</label>
                      <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Visible to the requester" />
                      <div className="flex gap-2">
                        <button disabled={busy} onClick={confirmReject} className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                          Confirm rejection
                        </button>
                        <button onClick={() => setRejecting(false)} className={btnGhost}>Back</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {req.status === "Rejected" && req.rejection_reason && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <div className="font-medium">Rejected</div>
                  {req.rejection_reason}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <Item label="Coworker" value={req.coworker ? `${req.coworker.name}${req.coworker.job_type ? ` (${req.coworker.job_type})` : ""}` : "—"} />
                <Item label="Requested by" value={requesterName(req)} />
                <Item label="Request date" value={fmtDate(req.request_date)} />
                <Item label="Handover date" value={fmtDate(req.handover_date)} />
                <Item label="Référence" value={req.reference || "—"} />
                <Item label="Supplier" value={req.supplier} />
                <Item label="Quantity" value={String(req.quantity)} />
                <Item
                  label="Unit price / total"
                  value={req.unit_price === null ? "—" : `${formatMoney(req.unit_price)} / ${formatMoney(total ?? 0)}`}
                />
                <div className="col-span-2">
                  <dt className="text-xs text-[#718096]">Product link</dt>
                  <dd>
                    {req.supplier_url ? (
                      <a href={req.supplier_url} target="_blank" rel="noopener noreferrer" className="text-[#0058A3] hover:underline inline-flex items-center gap-1 break-all">
                        {req.supplier_url} <ExternalLink size={14} />
                      </a>
                    ) : "—"}
                  </dd>
                </div>
                <div className="col-span-2"><Item label="Description" value={req.description || "—"} /></div>
                <div className="col-span-2"><Item label="Note" value={req.note || "—"} /></div>
              </dl>

              <div className="flex gap-2">
                {canEdit && (
                  <button onClick={startEdit} className={btnGhost}>
                    <Pencil size={15} /> Edit
                  </button>
                )}
                {canCancelOwn && (
                  <button onClick={cancelOwn} disabled={busy} className="px-4 py-2 text-sm rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60">
                    Cancel request
                  </button>
                )}
              </div>
              {!isAdmin && isOwner && req.status !== "Submitted" && (
                <p className="text-xs text-[#718096]">
                  This request is already being processed, so only an admin can change it.
                </p>
              )}

              {/* History */}
              <div>
                <h3 className="font-semibold text-[#1A202C] mb-3">History</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-[#4A5568]">No history yet.</p>
                ) : (
                  <ol className="relative border-l border-[#E2E8F0] ml-2 space-y-4">
                    {history.map((h) => (
                      <li key={h.id} className="ml-4">
                        <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-[#0058A3] border-2 border-white" />
                        <div className="text-sm text-[#1A202C]">
                          {h.from_status ? (
                            <>
                              <StatusBadge status={h.from_status} /> → <StatusBadge status={h.to_status} />
                            </>
                          ) : (
                            <>Created as <StatusBadge status={h.to_status} /></>
                          )}
                        </div>
                        <div className="text-xs text-[#718096] mt-0.5">
                          {fmtDateTime(h.changed_at)}
                          {h.changer && ` · ${h.changer.full_name || h.changer.email}`}
                        </div>
                        {h.reason && <div className="text-xs text-[#4A5568] mt-1">“{h.reason}”</div>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}

          {req && editing && (
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className={labelClass}>Coworker</label>
                <select required value={form.coworker_id} onChange={set("coworker_id")} className={inputClass}>
                  {coworkers
                    .filter((c) => c.is_active || c.id === form.coworker_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.job_type ? ` (${c.job_type})` : ""}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Tool name</label>
                <input required value={form.tool_name} onChange={set("tool_name")} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Référence</label>
                <input value={form.reference} onChange={set("reference")} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea rows={2} value={form.description} onChange={set("description")} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Supplier</label>
                  <input value={form.supplier} onChange={set("supplier")} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Quantity</label>
                  <input type="number" min={1} required value={form.quantity} onChange={set("quantity")} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Product link</label>
                <input type="url" value={form.supplier_url} onChange={set("supplier_url")} className={inputClass} placeholder="https://…" />
              </div>
              <div>
                <label className={labelClass}>Unit price (MAD)</label>
                <input type="number" min={0} step="0.01" value={form.unit_price} onChange={set("unit_price")} className={inputClass} />
              </div>
              {isAdmin && (req.status === "Delivered" || req.status === "Closed") && (
                <div>
                  <label className={labelClass}>Handover date</label>
                  <input type="date" value={form.handover_date} onChange={set("handover_date")} className={inputClass} />
                </div>
              )}
              <div>
                <label className={labelClass}>Note</label>
                <textarea rows={2} value={form.note} onChange={set("note")} className={inputClass} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
                <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#718096]">{label}</dt>
      <dd className="text-[#1A202C] whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
