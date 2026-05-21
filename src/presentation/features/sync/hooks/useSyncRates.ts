"use client";

import { useState } from "react";
import type { RateSyncResult } from "@/domain/types";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

export function useSyncRates() {
  const authFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RateSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSync(driveLink: string): Promise<{ ok: true; result: RateSyncResult } | { ok: false; error: string }> {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await authFetch("/api/sync-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveLink }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Rate sync failed";
        setError(errMsg);
        return { ok: false, error: errMsg };
      }
      const syncResult = data as RateSyncResult;
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
