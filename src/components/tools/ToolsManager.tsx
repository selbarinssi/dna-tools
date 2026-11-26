"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tool, Profile } from "@/types";
import { Plus, Pencil, Trash2, X, RefreshCw, Upload } from "lucide-react";

export default function ToolsManager() {
  const supabase = createClient();
  const [tools, setTools] = useState<Tool[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    supplier: "Bricoma",
    unit_price: "",
    reference: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

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

    const { data, error: fetchError } = await supabase
      .from("tools")
      .select("*")
      .order("name");

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setTools((data as Tool[]) || []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isAdmin = currentUser?.role === "admin";

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      description: "",
      category: "",
      supplier: "Bricoma",
      unit_price: "",
      reference: "",
      is_active: true,
    });
    setShowForm(true);
  };

  const openEdit = (t: Tool) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || "",
      category: t.category || "",
      supplier: t.supplier || "Bricoma",
      unit_price: t.unit_price === null ? "" : String(t.unit_price),
      reference: t.reference || "",
      is_active: t.is_active,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      supplier: form.supplier.trim() || "Bricoma",
      unit_price: form.unit_price ? Number(form.unit_price) : null,
      reference: form.reference.trim() || null,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error: updateError } = await supabase
        .from("tools")
        .update(payload)
        .eq("id", editingId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("tools").insert(payload);

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    loadData();
  };

  const handleImport = async (file: File) => {
    if (!isAdmin) return;
    setImporting(true);
    setError(null);

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) throw new Error("File is empty or missing header");

      // Expected header: Tool Name, Description, Category, Supplier, Price, Reference
      const rows = lines.slice(1).map((line) => {
        const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
        return {
          name: parts[0],
          description: parts[1] || null,
          category: parts[2] || null,
          supplier: parts[3] || "Bricoma",
          unit_price: parts[4] ? Number(parts[4]) : null,
          reference: parts[5] || null,
          is_active: true,
        };
      });

      const payload = rows.filter((r) => r.name);

      if (payload.length === 0) throw new Error("No valid rows found");

      const { error: insertError } = await supabase.from("tools").insert(payload);

      if (insertError) throw new Error(insertError.message);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (t: Tool) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(`Delete tool "${t.name}"?`);
    if (!confirmed) return;

    setError(null);
    const { error: deleteError } = await supabase.from("tools").delete().eq("id", t.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadData();
  };

  const toggleActive = async (t: Tool) => {
    if (!isAdmin) return;

    const { error: updateError } = await supabase
      .from("tools")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    loadData();
  };

  if (!isAdmin && currentUser) {
    return (
      <div className="p-8 text-center text-[#4A5568]">
        Only admins can manage the tools catalog.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Tools</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            {tools.length} tool{tools.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 rounded-md border border-[#E2E8F0] hover:bg-gray-50 text-[#4A5568]"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>

          {isAdmin && (
            <>
              <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-[#E2E8F0] rounded-md cursor-pointer hover:bg-gray-50 text-[#1A202C]">
                <Upload size={16} />
                {importing ? "Importing…" : "Import CSV"}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = "";
                  }}
                />
              </label>

              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 bg-[#0058A3] hover:bg-[#003D73] text-white text-sm font-medium rounded-md transition"
              >
                <Plus size={18} />
                Add Tool
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading && tools.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">Loading…</div>
        ) : tools.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">
            No tools yet.
            {isAdmin && " Click Add Tool or Import CSV."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Tool Name</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Supplier</th>
                  <th className="text-right px-4 py-3 font-medium text-[#4A5568]">Price</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Reference</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Status</th>
                  {isAdmin && (
                    <th className="text-right px-4 py-3 font-medium text-[#4A5568]">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {tools.map((t) => (
                  <tr key={t.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium text-[#1A202C]">{t.name}</td>
                    <td className="px-4 py-3 text-[#4A5568] max-w-xs truncate">
                      {t.description || "—"}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568]">{t.category || "—"}</td>
                    <td className="px-4 py-3 text-[#4A5568]">{t.supplier}</td>
                    <td className="px-4 py-3 text-right text-[#4A5568]">
                      {t.unit_price === null ? "—" : t.unit_price}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568]">{t.reference || "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(t)}
                        disabled={!isAdmin}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          t.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                        } ${isAdmin ? "cursor-pointer hover:opacity-80" : ""}`}
                      >
                        {t.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(t)}
                            className="p-1.5 rounded hover:bg-gray-100 text-[#4A5568]"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-lg font-semibold text-[#1A202C]">
                {editingId ? "Edit Tool" : "Add Tool"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">
                  Tool Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">Supplier</label>
                <input
                  type="text"
                  value={form.supplier}
                  onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">Price</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unit_price}
                  onChange={(e) => setForm((p) => ({ ...p, unit_price: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">Reference</label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tool_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                <label htmlFor="tool_active" className="text-sm text-[#1A202C]">
                  Active
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm border border-[#E2E8F0] rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[#0058A3] hover:bg-[#003D73] text-white rounded-md disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
