"use client";

import { useState } from "react";
import type { ProductImportResult } from "@/domain/types";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

export function useProductImport() {
  const authFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport(driveLink?: string): Promise<{ ok: true; result: ProductImportResult } | { ok: false; error: string }> {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body = driveLink?.trim()
        ? { driveLink: driveLink.trim() }
        : {};
      const res = await authFetch("/api/import-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Product import failed";
        setError(errMsg);
        return { ok: false, error: errMsg };
      }
      const importResult = data as ProductImportResult;
      setResult(importResult);
      return { ok: true, result: importResult };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Request failed";
      setError(errMsg);
      return { ok: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  }

  return { runImport, loading, result, error };
}
