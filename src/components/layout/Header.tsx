"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Profile } from "@/types";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Header() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setProfile(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!cancelled && data) setProfile(data as Profile);
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // Stable list: base always shown; admin extras only when we know role
  const isAdmin = profile?.role === "admin";

  const navItems = [
    { href: "/", label: "Requests" },
    { href: "/coworkers", label: "Coworkers" },
    ...(isAdmin ? [{ href: "/tools", label: "Tools" }] : []),
    { href: "/reporting", label: "Reporting" },
    ...(isAdmin ? [{ href: "/users", label: "Users" }] : []),
  ];

  if (pathname === "/login") return null;
  return (
    <header className="bg-[#0058A3] text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="font-bold text-lg tracking-tight hover:opacity-90 shrink-0">
            D&A Tools
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition",
                  pathname === item.href
                    ? "bg-white/20 font-medium"
                    : "hover:bg-white/10 opacity-90"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {profile && (
            <>
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium leading-tight">
                  {profile.full_name || profile.email}
                </div>
                <div className="text-xs opacity-80 capitalize">
                  {profile.role.replace("_", " ")}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition"
                title="Sign out"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="sm:hidden border-t border-white/10 px-6 py-2 flex gap-2 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "px-3 py-1 rounded text-sm whitespace-nowrap",
              pathname === item.href ? "bg-white/20 font-medium" : "opacity-80"
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
