"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

const DEFAULT_RATE = 167000;

export function useGoldRate() {
  const authFetch = useAuthenticatedFetch();
  const [rate, setRate] = useState<number | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    authFetch("/api/admin/gold-rate")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const r = (data as { rate?: number }).rate;
        const value =
          typeof r === "number" && Number.isFinite(r) ? r : null;
        setRate(value ?? DEFAULT_RATE);
        setInputVal(
          value != null ? String(value) : String(DEFAULT_RATE)
        );
        if (data.error) {
          setError(
            (data as { error?: string }).error ?? "Can't reach server. Using default rate until connected."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Can't reach server. Check your internet connection. Using default rate until connected."
          );
          setRate(DEFAULT_RATE);
          setInputVal(String(DEFAULT_RATE));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  async function saveRate(): Promise<{ ok: true } | { ok: false; error: string }> {
    const trimmed = inputVal.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed < 0) {
      const errMsg = "Please enter a valid numeric rate.";
      setError(errMsg);
      setSuccess(null);
      return { ok: false, error: errMsg };
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch("/api/admin/gold-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Failed to update gold rate.";
        setError(errMsg);
        return { ok: false, error: errMsg };
      }
      setRate(parsed);
      setSuccess("Gold rate updated.");
      return { ok: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to update gold rate.";
      setError(errMsg);
      return { ok: false, error: errMsg };
    } finally {
      setSaving(false);
    }
  }

  return {
    rate,
    inputVal,
    setInputVal,
    loading,
    saving,
    error,
    success,
    saveRate,
  };
}
