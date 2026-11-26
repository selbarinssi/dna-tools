"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coworker, Profile } from "@/types";
import { Plus, Pencil, Trash2, X, RefreshCw, Upload } from "lucide-react";
import { readSpreadsheet, col } from "@/lib/excel";

export default function CoworkersManager() {
  const supabase = createClient();
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    external_id: "",
    name: "",
    job_type: "",
    tl: "",
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
      .from("coworkers")
      .select("*")
      .order("name");

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCoworkers((data as Coworker[]) || []);
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
      external_id: "",
      name: "",
      job_type: "",
      tl: "",
      is_active: true,
    });
    setShowForm(true);
  };

  const openEdit = (c: Coworker) => {
    setEditingId(c.id);
    setForm({
      external_id: c.external_id || "",
      name: c.name,
      job_type: c.job_type || "",
      tl: c.tl || "",
      is_active: c.is_active,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setError(null);

    const payload = {
      external_id: form.external_id.trim() || null,
      name: form.name.trim(),
      job_type: form.job_type.trim() || null,
      tl: form.tl.trim() || null,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error: updateError } = await supabase
        .from("coworkers")
        .update(payload)
        .eq("id", editingId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("coworkers").insert(payload);

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

    // Excel/CSV columns: Id | Agent Name | Job Type | TL
  // MERGE: same Id → update; new Id → insert; missing from file → left alone
  const handleImport = async (file: File) => {
    if (!isAdmin) return;
    setImporting(true);
    setError(null);

    try {
            const rows = await readSpreadsheet(file);

      const mapped = rows
        .map((row) => ({
          external_id: col(row, "Id", "ID", "id") || null,
          name: col(row, "Agent Name", "Name", "name"),
          job_type: col(row, "Job Type", "JobType", "job_type") || null,
          tl: col(row, "TL", "Team Leader", "tl") || null,
          is_active: true,
        }))
        .filter((r) => r.name);

      if (mapped.length === 0) {
        throw new Error("No valid rows found. Expected columns: Id, Agent Name, Job Type, TL");
      }

      // Last row wins if the same Id appears twice in the file
      const byId = new Map<string, (typeof mapped)[0]>();
      const withoutId: typeof mapped = [];

      for (const r of mapped) {
        if (r.external_id) {
          byId.set(r.external_id, r);
        } else {
          withoutId.push(r);
        }
      }

      const withId = Array.from(byId.values());

      if (withId.length > 0) {
        const { error: upsertError } = await supabase.from("coworkers").upsert(withId, {
          onConflict: "external_id",
          ignoreDuplicates: false,
        });
        if (upsertError) throw new Error(upsertError.message);
      }

      if (withoutId.length > 0) {
        const { error: insertError } = await supabase.from("coworkers").insert(withoutId);
        if (insertError) throw new Error(insertError.message);
      }

      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (c: Coworker) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(`Delete coworker "${c.name}"?`);
    if (!confirmed) return;

    setError(null);
    const { error: deleteError } = await supabase.from("coworkers").delete().eq("id", c.id);

    if (deleteError) {
      setError(
        deleteError.message.includes("foreign key")
          ? `Cannot delete "${c.name}" because existing requests reference this coworker. Set them to Inactive instead.`
          : deleteError.message
      );
      return;
    }

    await loadData();
  };

  const toggleActive = async (c: Coworker) => {
    if (!isAdmin) return;

    const { error: updateError } = await supabase
      .from("coworkers")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Coworkers</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            {coworkers.length} coworker{coworkers.length !== 1 ? "s" : ""}
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
                Add Coworker
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
        {loading && coworkers.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">Loading…</div>
        ) : coworkers.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">
            No coworkers yet.
            {isAdmin && " Click Add Coworker or Import CSV."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Id</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Agent Name</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Job Type</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">TL</th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Status</th>
                  {isAdmin && (
                    <th className="text-right px-4 py-3 font-medium text-[#4A5568]">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {coworkers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 text-[#4A5568]">{c.external_id || "—"}</td>
                    <td className="px-4 py-3 font-medium text-[#1A202C]">{c.name}</td>
                    <td className="px-4 py-3 text-[#4A5568]">{c.job_type || "—"}</td>
                    <td className="px-4 py-3 text-[#4A5568]">{c.tl || "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        title={isAdmin ? "Click to toggle active / inactive" : undefined}
                        onClick={() => toggleActive(c)}
                        disabled={!isAdmin}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          c.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                        } ${isAdmin ? "cursor-pointer hover:opacity-80" : ""}`}
                      >
                        {c.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 rounded hover:bg-gray-100 text-[#4A5568]"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
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
                {editingId ? "Edit Coworker" : "Add Coworker"}
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
                <label className="block text-sm font-medium text-[#1A202C] mb-1">Id</label>
                <input
                  type="text"
                  value={form.external_id}
                  onChange={(e) => setForm((p) => ({ ...p, external_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                  placeholder="Agent Id from your list"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">
                  Agent Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">Job Type</label>
                <input
                  type="text"
                  value={form.job_type}
                  onChange={(e) => setForm((p) => ({ ...p, job_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A202C] mb-1">TL</label>
                <input
                  type="text"
                  value={form.tl}
                  onChange={(e) => setForm((p) => ({ ...p, tl: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                  placeholder="Team Leader name"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="cw_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                <label htmlFor="cw_active" className="text-sm text-[#1A202C]">
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
