"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coworker, Profile } from "@/types";
import { Plus, Pencil, X, Check, RefreshCw, Upload } from "lucide-react";

export default function CoworkersManager() {
  const supabase = createClient();
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", team: "", is_active: true });
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
    setForm({ name: "", team: "", is_active: true });
    setShowForm(true);
  };

  const openEdit = (c: Coworker) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      team: c.team || "",
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
      name: form.name.trim(),
      team: form.team.trim() || null,
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
      const { error: insertError } = await supabase
        .from("coworkers")
        .insert(payload);

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

      // Expect header: ID, Coworker Name, Team (or Name, Team)
      const header = lines[0].toLowerCase();
      const hasId = header.includes("id");
      const rows = lines.slice(1).map((line) => {
        const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
        if (hasId) {
          return {
            external_id: parts[0] || null,
            name: parts[1],
            team: parts[2] || null,
          };
        }
        return {
          external_id: null,
          name: parts[0],
          team: parts[1] || null,
        };
      });

      const payload = rows
        .filter((r) => r.name)
        .map((r) => ({
          external_id: r.external_id,
          name: r.name,
          team: r.team,
          is_active: true,
        }));

      if (payload.length === 0) throw new Error("No valid rows found");

      const { error: upsertError } = await supabase.from("coworkers").upsert(payload, {
        onConflict: "name",
        ignoreDuplicates: false,
      });

      if (upsertError) throw new Error(upsertError.message);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
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
      {/* Header */}
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
                {importing ? "Importing…" : "Import Excel/CSV"}
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx"
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

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading && coworkers.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">Loading…</div>
        ) : coworkers.length === 0 ? (
          <div className="p-12 text-center text-[#4A5568]">
            No coworkers yet.
            {isAdmin && " Click Add Coworker to create the first one."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Team
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#4A5568]">
                    Status
                  </th>
                  {isAdmin && (
                    <th className="text-right px-4 py-3 font-medium text-[#4A5568]">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {coworkers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium text-[#1A202C]">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568]">
                      {c.team || "—"}
                    </td>
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
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 rounded hover:bg-gray-100 text-[#4A5568]"
                            title="Edit"
                          >
                            <Pencil size={16} />
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

      {/* Form Modal */}
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
                <label className="block text-sm font-medium text-[#1A202C] mb-1">
                  Name <span className="text-red-500">*</span>
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
                <label className="block text-sm font-medium text-[#1A202C] mb-1">
                  Team
                </label>
                <input
                  type="text"
                  value={form.team}
                  onChange={(e) => setForm((p) => ({ ...p, team: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0058A3]"
                  placeholder="e.g. Assembly, Logistics…"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, is_active: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-[#0058A3] focus:ring-[#0058A3]"
                />
                <label htmlFor="is_active" className="text-sm text-[#1A202C]">
                  Active (appears in the request form). Deactivate instead of deleting so old requests keep their coworker.
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-[#4A5568] hover:bg-gray-100 rounded-md transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-[#0058A3] hover:bg-[#003D73] text-white rounded-md transition disabled:opacity-60"
                >
                  <Check size={16} />
                  {saving ? "Saving…" : editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
