"use client";

import { useState } from "react";
import type { LocalImportPreview, ProductImportResult } from "@/domain/types";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

export function useImport() {
  const authFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [preview, setPreview] = useState<LocalImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function previewImport(
    localFolderPath: string,
    driveDestinationFolderLink: string
  ): Promise<{ ok: true; preview: LocalImportPreview } | { ok: false; error: string }> {
    setPreviewLoading(true);
    setPreview(null);
    setPreviewError(null);
    try {
      const res = await authFetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localFolderPath: localFolderPath.trim(),
          driveDestinationFolderLink: driveDestinationFolderLink.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Folder check failed";
        setPreviewError(errMsg);
        return { ok: false, error: errMsg };
      }
      const importPreview = data as LocalImportPreview;
      setPreview(importPreview);
      return { ok: true, preview: importPreview };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Folder check failed";
      setPreviewError(errMsg);
      return { ok: false, error: errMsg };
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runImport(
    localFolderPath: string,
    driveDestinationFolderLink: string
  ): Promise<{ ok: true; result: ProductImportResult } | { ok: false; error: string }> {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await authFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localFolderPath: localFolderPath.trim(),
          driveDestinationFolderLink: driveDestinationFolderLink.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Import failed";
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

  function clearPreview() {
    setPreview(null);
    setPreviewError(null);
  }

  return {
    runImport,
    previewImport,
    clearPreview,
    loading,
    previewLoading,
    result,
    preview,
    error,
    previewError,
  };
}
