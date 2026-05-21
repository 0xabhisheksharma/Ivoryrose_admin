"use client";

import { useEffect, useState } from "react";
import { AdminCard } from "@/presentation/components/admin/AdminCard";
import { AdminStatCard } from "@/presentation/components/admin/AdminStatCard";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

type DashboardStats = {
  totalProducts: number;
  totalTags: number;
  totalRates: number;
  goldRate: number | null;
  goldRateUpdatedAt: string | null;
  lastProductUpdate: string | null;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export default function AdminPage() {
  const authFetch = useAuthenticatedFetch();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/admin/dashboard")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError((data as { error: string }).error);
          return;
        }
        setStats(data as DashboardStats);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  if (loading) {
    return (
      <AdminCard title="Dashboard" description="Overview of admin data.">
        <p className="text-sm text-slate-400">Loading…</p>
      </AdminCard>
    );
  }

  if (error) {
    return (
      <AdminCard title="Dashboard" description="Overview of admin data.">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      </AdminCard>
    );
  }

  const s = stats!;

  return (
    <AdminCard
      title="Dashboard"
      description="Overview of products, tags, rates, and gold rate."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <AdminStatCard label="Total Products" value={s.totalProducts} />
        <AdminStatCard label="Total Tags" value={s.totalTags} />
        <AdminStatCard label="Total Rate Records" value={s.totalRates} />
        <AdminStatCard
          label="Current Gold Rate"
          value={s.goldRate != null ? s.goldRate : "—"}
          helperText={
            s.goldRateUpdatedAt
              ? `Updated ${formatDateTime(s.goldRateUpdatedAt)}`
              : undefined
          }
        />
        <AdminStatCard
          label="Last product update"
          value={formatDateTime(s.lastProductUpdate)}
          helperText="Approx. last import"
        />
      </div>
    </AdminCard>
  );
}
