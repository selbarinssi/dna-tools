"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coworker, Profile } from "@/types";
import { DEFAULT_SUPPLIER } from "@/lib/constants";
import { X } from "lucide-react";

interface RequestFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: Profile | null;
}

export default function RequestForm({
  open,
  onClose,
  onSuccess,
  currentUser,
}: RequestFormProps) {
  const supabase = createClient();
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    coworker_id: "",
    tool_name: "",
    reference: "",
    description: "",
    supplier: DEFAULT_SUPPLIER,
    quantity: 1,
    note: "",
    unit_price: "",
  });

  useEffect(() => {
    if (!open) return;

    const loadCoworkers = async () => {
      const { data } = await supabase
        .from("coworkers")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (data) setCoworkers(data as Coworker[]);
    };

    loadCoworkers();
  }, [open, supabase]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

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
      quantity: Number(form.quantity) || 1,
      note: form.note.trim() || null,
      unit_price: form.unit_price ? Number(form.unit_price) : null,
      status: "Submitted",
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Reset form
    setForm({
      coworker_id: "",
      tool_name: "",
      reference: "",
      description: "",
      supplier: DEFAULT_SUPPLIER,
      quantity: 1,
      note: "",
      unit_price: "",
    });

    setLoading(false);
    onSuccess();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#1A202C]">
            New Tool Request
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Coworker */}
          <div>
            <label className="block text-sm font-medium text-[#1A202C] mb-1">
              Coworker (Receiver) <span className="text-red-500">*</span>
            </label>
            <select
              name="coworker_id"
              required
              value={form.coworker_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
            >
              <option value="">Select coworker…</option>
              {coworkers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.team ? ` (${c.team})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Tool name */}
          <div>
            <label className="block text-sm font-medium text-[#1A202C] mb-1">
              Tool name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="tool_name"
              required
              value={form.tool_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
              placeholder="e.g. Cordless drill"
            />
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-[#1A202C] mb-1">
              Référence
            </label>
            <input
              type="text"
              name="reference"
              value={form.reference}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
              placeholder="SKU / reference"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#1A202C] mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={2}
              value={form.description}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
              placeholder="Optional details"
            />
          </div>

          {/* Supplier + Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1A202C] mb-1">
                Supplier
              </label>
              <input
                type="text"
                name="supplier"
                value={form.supplier}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A202C] mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="quantity"
                required
                min={1}
                value={form.quantity}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
              />
            </div>
          </div>

          {/* Unit price */}
          <div>
            <label className="block text-sm font-medium text-[#1A202C] mb-1">
              Unit price (optional)
            </label>
            <input
              type="number"
              name="unit_price"
              min={0}
              step="0.01"
              value={form.unit_price}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
              placeholder="0.00"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-[#1A202C] mb-1">
              Note
            </label>
            <textarea
              name="note"
              rows={2}
              value={form.note}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
              placeholder="Any additional note…"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4A5568] hover:bg-gray-100 rounded-md transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-medium bg-[#0058A3] hover:bg-[#003D73] text-white rounded-md transition disabled:opacity-60"
            >
              {loading ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
