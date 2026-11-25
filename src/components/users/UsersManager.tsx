"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/types";
import { inputClass, errorBox } from "@/components/ui/styles";
import { RefreshCw } from "lucide-react";

export default function UsersManager() {
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    const list = (data as Profile[]) ?? [];
    setUsers(list);
    setMe(list.find((p) => p.id === user?.id) ?? null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (id: string, patch: Partial<Pick<Profile, "role" | "is_active" | "full_name">>) => {
    setError(null);
    const { error: err } = await supabase.from("profiles").update(patch).eq("id", id);
    if (err) setError(err.message);
    await load();
  };

  if (!loading && me?.role !== "admin") {
    return <div className="p-12 text-center text-[#4A5568]">This page is for admins only.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C]">Users</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => load()} className="p-2 rounded-md border border-[#E2E8F0] hover:bg-gray-50 text-[#4A5568]" title="Refresh">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="text-sm text-[#4A5568] bg-blue-50 border border-blue-200 rounded-md px-4 py-3">
        <strong>To add a new user:</strong> Supabase Dashboard → Authentication → Users → Add user. A profile is created
        automatically as <em>Team leader</em>; come back here to promote them to admin if needed.
      </div>

      {error && <div className={errorBox}>{error}</div>}

      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Email</th>
                <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Role</th>
                <th className="text-left px-4 py-3 font-medium text-[#4A5568]">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {users.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3">
                      <input
                        defaultValue={u.full_name ?? ""}
                        placeholder="Full name"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (u.full_name ?? "")) update(u.id, { full_name: v || null });
                        }}
                        className={`${inputClass} !py-1`}
                      />
                    </td>
                    <td className="px-4 py-3 text-[#4A5568]">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={isMe}
                        title={isMe ? "You cannot change your own role" : undefined}
                        onChange={(e) => update(u.id, { role: e.target.value as UserRole })}
                        className={`${inputClass} !py-1 !w-auto`}
                      >
                        <option value="team_leader">Team leader</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={isMe}
                        onClick={() => update(u.id, { is_active: !u.is_active })}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          u.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"
                        } ${isMe ? "" : "hover:opacity-80"}`}
                      >
                        {u.is_active ? "Active" : "Deactivated"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
