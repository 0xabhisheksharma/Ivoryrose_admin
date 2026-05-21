"use client";

import { useState } from "react";
import type { SyncResult } from "@/domain/types";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

export function useSyncTags() {
  const authFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSync(body: { driveLink?: string } | Record<string, never>): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await authFetch("/api/sync-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Sync failed";
        setError(errMsg);
        return { ok: false, error: errMsg };
      }
      const syncResult = data as SyncResult;
      setResult(syncResult);
      return { ok: true, result: syncResult };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Request failed";
      setError(errMsg);
      return { ok: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  }

  return { runSync, loading, result, error };
}
