"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coworker, Profile } from "@/types";
import { DEFAULT_SUPPLIER } from "@/lib/constants";
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
  tool_name: "",
  reference: "",
  description: "",
  supplier: DEFAULT_SUPPLIER,
  supplier_url: "",
  quantity: 1,
  note: "",
  unit_price: "",
};

export default function RequestForm({ open, onClose, onSuccess, currentUser }: RequestFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("coworkers")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (data) setCoworkers(data as Coworker[]);
    })();
  }, [open, supabase]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const url = form.supplier_url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setError("Product link must start with http:// or https://");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: insertError } = await supabase.from("requests").insert({
      request_date: new Date().toISOString().slice(0, 10),
      requested_by: currentUser.id,
      coworker_id: form.coworker_id,
      tool_name: form.tool_name.trim(),
      reference: form.reference.trim() || null,
      description: form.description.trim() || null,
      supplier: form.supplier.trim() || DEFAULT_SUPPLIER,
      supplier_url: url || null,
      quantity: Number(form.quantity) || 1,
      note: form.note.trim() || null,
      unit_price: form.unit_price ? Number(form.unit_price) : null,
      status: "Submitted",
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm(EMPTY_FORM);
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
          <div>
            <label className={labelClass}>
              Coworker (Receiver) <span className="text-red-500">*</span>
            </label>
            <select name="coworker_id" required value={form.coworker_id} onChange={handleChange} className={inputClass}>
              <option value="">Select coworker…</option>
              {coworkers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.team ? ` (${c.team})` : ""}
                </option>
              ))}
            </select>
            {coworkers.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No active coworkers yet. Ask an admin to add some in the Coworkers page.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              Tool name <span className="text-red-500">*</span>
            </label>
            <input type="text" name="tool_name" required value={form.tool_name} onChange={handleChange} className={inputClass} placeholder="e.g. Cordless drill" />
          </div>

          <div>
            <label className={labelClass}>Référence</label>
            <input type="text" name="reference" value={form.reference} onChange={handleChange} className={inputClass} placeholder="SKU / reference" />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea name="description" rows={2} value={form.description} onChange={handleChange} className={inputClass} placeholder="Optional details" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Supplier</label>
              <input type="text" name="supplier" value={form.supplier} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                Quantity <span className="text-red-500">*</span>
              </label>
              <input type="number" name="quantity" required min={1} value={form.quantity} onChange={handleChange} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Product link (e.g. bricoma.ma page)</label>
            <input type="url" name="supplier_url" value={form.supplier_url} onChange={handleChange} className={inputClass} placeholder="https://…" />
          </div>

          <div>
            <label className={labelClass}>Unit price (MAD, optional)</label>
            <input type="number" name="unit_price" min={0} step="0.01" value={form.unit_price} onChange={handleChange} className={inputClass} placeholder="0.00" />
          </div>

          <div>
            <label className={labelClass}>Note</label>
            <textarea name="note" rows={2} value={form.note} onChange={handleChange} className={inputClass} placeholder="Any additional note…" />
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
