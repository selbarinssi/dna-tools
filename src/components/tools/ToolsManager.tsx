"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tool, Profile } from "@/types";
import { Plus, Pencil, Trash2, X, RefreshCw, Upload } from "lucide-react";
import { readSpreadsheet, col } from "@/lib/excel";

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
    product_url: "",
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
      product_url: "",
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
      product_url: t.product_url || "",
      category: t.category || "",
      supplier: t.supplier || "Bricoma",
      unit_price: t.unit_price === null || t.unit_price === undefined ? "" : String(t.unit_price),
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
      product_url: form.product_url.trim() || null,
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

  // Excel columns: Tool Name | Link | Category | Supplier | Price | Reference
  // MERGE: same Reference or same Name → update; else insert
  const handleImport = async (file: File) => {
    if (!isAdmin) return;
    setImporting(true);
    setError(null);

    try {
      const rows = await readSpreadsheet(file);

      const mapped = rows
        .map((row) => ({
          name: col(row, "Tool Name", "Name", "name"),
          product_url:
            col(row, "Link", "Product Link", "URL", "product_url", "Description") || null,
          category: col(row, "Category", "category") || null,
          supplier: col(row, "Supplier", "supplier") || "Bricoma",
          unit_price: (() => {
            const p = col(row, "Price", "Unit Price", "unit_price");
            if (!p) return null;
            const n = Number(String(p).replace(",", "."));
            return Number.isFinite(n) ? n : null;
          })(),
          reference: col(row, "Reference", "Référence", "Ref", "reference") || null,
          is_active: true,
        }))
        .filter((r) => r.name);

      if (mapped.length === 0) {
        throw new Error(
          "No valid rows found. Expected columns: Tool Name, Link, Category, Supplier, Price, Reference"
        );
      }

      const { data: existing, error: loadErr } = await supabase
        .from("tools")
        .select("id, name, reference");
      if (loadErr) throw new Error(loadErr.message);

      const byRef = new Map<string, string>();
      const byName = new Map<string, string>();
      for (const t of existing ?? []) {
        if (t.reference) byRef.set(String(t.reference).toLowerCase(), t.id);
        byName.set(String(t.name).toLowerCase(), t.id);
      }

      const toInsert: typeof mapped = [];
      const toUpdate: { id: string; payload: (typeof mapped)[0] }[] = [];

      for (const row of mapped) {
        const refKey = row.reference ? row.reference.toLowerCase() : "";
        const nameKey = row.name.toLowerCase();
        const existingId =
          (refKey && byRef.get(refKey)) || byName.get(nameKey) || null;

        if (existingId) {
          toUpdate.push({ id: existingId, payload: row });
        } else {
          toInsert.push(row);
        }
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("tools").insert(toInsert);
        if (insErr) throw new Error(insErr.message);
      }

      for (const u of toUpdate) {
        const { error: upErr } = await supabase
          .from("tools")
          .update(u.payload)
          .eq("id", u.id);
        if (upErr) throw new Error(upErr.message);
      }

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
                {importing ? "Importing…" : "Import Excel"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
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
            {isAdmin && " Click Add Tool or Import Excel."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Tool Name</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Link</th>
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
                    <td className="px-4 py-3">
                      {t.product_url ? (
                        <a
                          href={t.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t.product_url}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 text-lg"
                        >
                          🔗
                        </a>
                      ) : (
                        <span className="text-[#718096]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568]">{t.category || "—"}</td>
                    <td className="px-4 py-3 text-[#4A5568]">{t.supplier}</td>
                    <td className="px-4 py-3 text-right text-[#4A5568]">
                      {t.unit_price === null || t.unit_price === undefined ? "—" : t.unit_price}
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
                <label className="block text-sm font-medium text-[#1A202C] mb-1">
                  Link (product page)
                </label>
                <input
                  type="url"
                  value={form.product_url}
                  onChange={(e) => setForm((p) => ({ ...p, product_url: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                  placeholder="https://www.bricoma.ma/..."
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
