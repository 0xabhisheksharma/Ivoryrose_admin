"use client";

import { useEffect, useState } from "react";
import type { ProductRow } from "@/domain/types";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

export function useProducts() {
  const authFetch = useAuthenticatedFetch();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/admin/products")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setProducts(data);
        else setError((data as { error?: string }).error ?? "Failed to load products");
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
  }, [authFetch]);

  return { products, loading, error };
}
