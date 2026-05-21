"use client";

import { useEffect, useState } from "react";
import type { ProductData } from "@/domain/types";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

export function useProduct(productId: string | null) {
  const authFetch = useAuthenticatedFetch();
  const [data, setData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(Boolean(productId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      return;
    }
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
        return authFetch(`/api/admin/products/${encodeURIComponent(productId)}`);
      })
      .then(async (res) => {
        const raw = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError((raw as { error?: string }).error ?? "Failed to load product");
          return;
        }
        setData(raw as ProductData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authFetch, productId]);

  return { data, loading, error };
}
