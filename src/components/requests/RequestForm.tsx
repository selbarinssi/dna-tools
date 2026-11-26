"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coworker, Profile, Tool } from "@/types";
import { inputClass, labelClass, btnPrimary, btnGhost, errorBox } from "@/components/ui/styles";
import { X } from "lucide-react";

interface RequestFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: Profile | null;
}

const EMPTY_FORM = {
  coworker_id: "",
  tool_id: "",
  quantity: 1,
  note: "",
};

export default function RequestForm({ open, onClose, onSuccess, currentUser }: RequestFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Searchable coworker picker
  const [coworkerQuery, setCoworkerQuery] = useState("");
  const [coworkerOpen, setCoworkerOpen] = useState(false);

  // Searchable tool picker
  const [toolQuery, setToolQuery] = useState("");
  const [toolOpen, setToolOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setCoworkerQuery("");
    setCoworkerOpen(false);
    setToolQuery("");
    setToolOpen(false);
    setError(null);

    (async () => {
      const [{ data: cw }, { data: tl }] = await Promise.all([
        supabase.from("coworkers").select("*").eq("is_active", true).order("name"),
        supabase.from("tools").select("*").eq("is_active", true).order("name"),
      ]);
      if (cw) setCoworkers(cw as Coworker[]);
      if (tl) setTools(tl as Tool[]);
    })();
  }, [open, supabase]);

  const filteredCoworkers = useMemo(() => {
    const q = coworkerQuery.trim().toLowerCase();
    if (!q) return coworkers;
    return coworkers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.job_type && c.job_type.toLowerCase().includes(q)) ||
        (c.tl && c.tl.toLowerCase().includes(q)) ||
        (c.external_id && c.external_id.toLowerCase().includes(q))
    );
  }, [coworkers, coworkerQuery]);

  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.reference && t.reference.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.supplier && t.supplier.toLowerCase().includes(q))
    );
  }, [tools, toolQuery]);

  const selectedCoworker = coworkers.find((c) => c.id === form.coworker_id);
  const selectedTool = tools.find((t) => t.id === form.tool_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!form.coworker_id) {
      setError("Please select a coworker from the list.");
      return;
    }
    if (!form.tool_id) {
      setError("Please select a tool from the catalog.");
      return;
    }

    const tool = tools.find((t) => t.id === form.tool_id);
    if (!tool) {
      setError("Selected tool not found. Please pick again.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: insertError } = await supabase.from("requests").insert({
      request_date: new Date().toISOString().slice(0, 10),
      requested_by: currentUser.id,
      coworker_id: form.coworker_id,
      tool_id: tool.id,
      tool_name: tool.name,
      reference: tool.reference,
      description: tool.description,
      supplier: tool.supplier || "Bricoma",
      quantity: Number(form.quantity) || 1,
      note: form.note.trim() || null,
      unit_price: tool.unit_price,
      status: "Submitted",
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm(EMPTY_FORM);
    setCoworkerQuery("");
    setToolQuery("");
    onSuccess();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#1A202C]">New Tool Request</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* ===== COWORKER ===== */}
          <div className="relative">
            <label className={labelClass}>
              Coworker (Receiver) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={
                coworkerOpen
                  ? coworkerQuery
                  : selectedCoworker
                    ? `${selectedCoworker.name}${selectedCoworker.job_type ? ` (${selectedCoworker.job_type})` : ""}`
                    : coworkerQuery
              }
              onChange={(e) => {
                setCoworkerQuery(e.target.value);
                setCoworkerOpen(true);
                setForm((prev) => ({ ...prev, coworker_id: "" }));
              }}
              onFocus={() => {
                setCoworkerOpen(true);
                setCoworkerQuery(selectedCoworker?.name ?? "");
              }}
              onBlur={() => {
                setTimeout(() => setCoworkerOpen(false), 150);
              }}
              placeholder="Type to search coworker…"
              className={inputClass}
              autoComplete="off"
              required={!form.coworker_id}
            />
            <input type="hidden" name="coworker_id" value={form.coworker_id} required />

            {coworkerOpen && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[#E2E8F0] bg-white shadow-lg">
                {filteredCoworkers.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-[#718096]">No match</li>
                ) : (
                  filteredCoworkers.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#F8FAFC]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setForm((prev) => ({ ...prev, coworker_id: c.id }));
                          setCoworkerQuery(c.name);
                          setCoworkerOpen(false);
                        }}
                      >
                        {c.name}
                        {c.job_type ? (
                          <span className="text-[#718096]"> ({c.job_type})</span>
                        ) : null}
                        {c.tl ? (
                          <span className="text-[#718096]"> · TL: {c.tl}</span>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            {coworkers.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No active coworkers yet. Ask an admin to add some in the Coworkers page.
              </p>
            )}
          </div>

          {/* ===== TOOL ===== */}
          <div className="relative">
            <label className={labelClass}>
              Tool Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={
                toolOpen
                  ? toolQuery
                  : selectedTool
                    ? `${selectedTool.name}${selectedTool.reference ? ` [${selectedTool.reference}]` : ""}`
                    : toolQuery
              }
              onChange={(e) => {
                setToolQuery(e.target.value);
                setToolOpen(true);
                setForm((prev) => ({ ...prev, tool_id: "" }));
              }}
              onFocus={() => {
                setToolOpen(true);
                setToolQuery(selectedTool?.name ?? "");
              }}
              onBlur={() => {
                setTimeout(() => setToolOpen(false), 150);
              }}
              placeholder="Type to search tool from catalog…"
              className={inputClass}
              autoComplete="off"
              required={!form.tool_id}
            />
            <input type="hidden" name="tool_id" value={form.tool_id} required />

            {toolOpen && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[#E2E8F0] bg-white shadow-lg">
                {filteredTools.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-[#718096]">No match</li>
                ) : (
                  filteredTools.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#F8FAFC]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setForm((prev) => ({ ...prev, tool_id: t.id }));
                          setToolQuery(t.name);
                          setToolOpen(false);
                        }}
                      >
                        <div className="font-medium text-[#1A202C]">{t.name}</div>
                        <div className="text-xs text-[#718096]">
                          {[t.category, t.supplier, t.reference, t.unit_price != null ? `${t.unit_price} MAD` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            {tools.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No tools in the catalog yet. Ask an admin to add tools in the Tools page.
              </p>
            )}

            {selectedTool && (
              <p className="text-xs text-emerald-700 mt-1">
                {selectedTool.supplier}
                {selectedTool.unit_price != null ? ` · ${selectedTool.unit_price} MAD` : ""}
                {selectedTool.reference ? ` · Ref: ${selectedTool.reference}` : ""}
              </p>
            )}
          </div>

          {/* ===== QUANTITY ===== */}
          <div>
            <label className={labelClass}>
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="quantity"
              required
              min={1}
              value={form.quantity}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, quantity: Number(e.target.value) || 1 }))
              }
              className={inputClass}
            />
          </div>

          {/* ===== NOTE ===== */}
          <div>
            <label className={labelClass}>Note</label>
            <textarea
              name="note"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              className={inputClass}
              placeholder="Any additional note…"
            />
          </div>

          {error && <div className={errorBox}>{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={btnPrimary}>
              {loading ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
