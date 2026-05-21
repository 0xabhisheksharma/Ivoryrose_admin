"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ADMIN_NAVIGATION } from "@/config/admin-navigation";
import { useAuth } from "@/presentation/auth/AuthContext";
import { ProtectedRoute } from "@/presentation/auth/ProtectedRoute";
import { AdminIcon } from "./AdminIcons";

const SIDEBAR_WIDTH = 264;
const SIDEBAR_COLLAPSED_WIDTH = 76;

function getPageTitle(pathname: string): string {
  const exact = ADMIN_NAVIGATION.find(({ href }) => href === pathname);
  if (exact) return exact.label;
  const startsWith = ADMIN_NAVIGATION.filter(
    (item) => item.href !== "/admin" && pathname.startsWith(item.href + "/")
  ).sort((a, b) => b.href.length - a.href.length)[0];
  return startsWith?.label ?? "Admin";
}

function getActiveNavigation(pathname: string) {
  return (
    ADMIN_NAVIGATION.filter(
      (item) => item.href !== "/admin" && pathname.startsWith(item.href + "/")
    ).sort((a, b) => b.href.length - a.href.length)[0] ??
    ADMIN_NAVIGATION.find((item) => item.href === pathname)
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { profile, logout, can } = useAuth();
  const visibleNavigation = ADMIN_NAVIGATION.filter((item) => can(item.permission));
  const activeNav = getActiveNavigation(pathname);

  return (
    <ProtectedRoute permission={activeNav?.permission ?? "dashboard.read"}>
      <div className="flex min-h-screen bg-[var(--admin-bg)] text-zinc-900">
        <aside
          className="sticky top-0 flex h-screen shrink-0 flex-col border-r border-zinc-950/80 bg-[var(--admin-sidebar)] transition-[width] duration-200 ease-in-out"
          style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
          aria-label="Admin navigation"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-3">
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--admin-accent)]">
                  Ivory Admin
                </span>
                <span className="block truncate text-xs text-zinc-400">Operations console</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)] focus:ring-offset-2 focus:ring-offset-[var(--admin-sidebar)]"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <AdminIcon
                name="collapse"
                className={`h-5 w-5 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            <ul className="space-y-1 px-2">
              {visibleNavigation.map(({ href, label, icon }) => {
                const isActive =
                  href === "/admin"
                    ? pathname === "/admin"
                    : pathname === href || pathname.startsWith(href + "/");

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={[
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-[var(--admin-accent)]/15 text-[var(--admin-accent)] ring-1 ring-[var(--admin-accent)]/25"
                          : "text-zinc-300 hover:bg-white/10 hover:text-white",
                        sidebarCollapsed ? "justify-center px-2" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={sidebarCollapsed ? label : undefined}
                    >
                      {icon && <AdminIcon name={icon} className="h-5 w-5 shrink-0" />}
                      {!sidebarCollapsed && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-white/10 p-3">
            {!sidebarCollapsed && (
              <div className="mb-3 min-w-0 rounded-md bg-white/[0.03] px-3 py-2">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {profile?.displayName || profile?.email || "Admin user"}
                </p>
                <p className="truncate text-xs text-zinc-400">{profile?.role}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className={[
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white",
                sidebarCollapsed ? "justify-center px-2" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={sidebarCollapsed ? "Sign out" : undefined}
            >
              <AdminIcon name="signOut" className="h-5 w-5 shrink-0" />
              {!sidebarCollapsed && <span>Sign out</span>}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/95 px-5 backdrop-blur lg:px-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admin</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-950">
                {getPageTitle(pathname)}
              </h1>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
