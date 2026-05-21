"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/presentation/components/ui/ToastContext";
import { useConfirmAction } from "@/presentation/components/ui/useConfirmAction";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { AdminCard } from "@/presentation/components/admin/AdminCard";
import { AdminButton } from "@/presentation/components/admin/AdminButton";
import { useAuth } from "@/presentation/auth/AuthContext";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";
import {
  AdminTable,
  AdminTableHeaderRow,
  AdminTableHeaderCell,
  AdminTableBody,
  AdminTableRow,
  AdminTableCell,
} from "@/presentation/components/admin/AdminTable";

const GOLD_RATE_API = "/api/admin/gold-rate";
const GOLD_RATE_HISTORY_API = "/api/admin/gold-rate/history";

type GoldRateEntry = {
  rate: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function AdminGoldRatePage() {
  const authFetch = useAuthenticatedFetch();
  const { can } = useAuth();
  const canEditGoldRate = can("goldRate.write");
  const [currentRate, setCurrentRate] = useState<GoldRateEntry>({
    rate: null,
    updatedAt: null,
    updatedBy: null,
  });
  const [history, setHistory] = useState<GoldRateEntry[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { showSuccess, showError } = useToast();
  const { openConfirm, confirmDialogProps } = useConfirmAction();

  const fetchCurrent = useCallback(async () => {
    const res = await authFetch(GOLD_RATE_API);
    const data = await res.json();
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load");
    const raw = data as {
      rate?: number;
      updatedAt?: string | null;
      updatedBy?: string | null;
    };
    const r = raw.rate;
    const rate = typeof r === "number" && Number.isFinite(r) ? r : null;
    setCurrentRate({
      rate,
      updatedAt: raw.updatedAt ?? null,
      updatedBy: raw.updatedBy ?? null,
    });
    setInputVal(typeof r === "number" && Number.isFinite(r) ? String(r) : "");
  }, [authFetch]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await authFetch(GOLD_RATE_HISTORY_API);
      const data = await res.json();
      if (!res.ok) {
        setHistory([]);
        return;
      }
      const list = Array.isArray(data) ? data : (data as { history?: GoldRateEntry[] }).history ?? [];
      setHistory(
        list.map((item: unknown) => {
          const o = item as Record<string, unknown>;
          const rate = o.rate;
          const rateNum =
            typeof rate === "number" && Number.isFinite(rate)
              ? rate
              : rate != null && rate !== ""
                ? Number(rate)
                : null;
          return {
            rate: rateNum != null && Number.isFinite(rateNum) ? rateNum : null,
            updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
            updatedBy: typeof o.updatedBy === "string" ? o.updatedBy : null,
          };
        })
      );
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHistoryLoading(true);
    setError(null);
    fetchCurrent()
      .then(() => {
        if (cancelled) return;
        return fetchHistory();
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setHistoryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchCurrent, fetchHistory]);

  async function performSave() {
    const trimmed = inputVal.trim();
    if (!trimmed) {
      setError("Enter a rate value.");
      setSuccess(null);
      showError("Enter a rate value.");
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      setError("Enter a valid non-negative number.");
      setSuccess(null);
      showError("Enter a valid non-negative number.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch(GOLD_RATE_API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: num }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Save failed";
        setError(errMsg);
        showError(errMsg);
        return;
      }
      setCurrentRate((prev) => ({
        ...prev,
        rate: num,
        updatedAt: new Date().toISOString(),
        updatedBy: prev.updatedBy,
      }));
      setSuccess("Gold rate updated.");
      showSuccess("Gold rate updated.");
      await fetchHistory();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Request failed";
      setError(errMsg);
      showError(errMsg);
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    const trimmed = inputVal.trim();
    if (!trimmed) {
      setError("Enter a rate value.");
      showError("Enter a rate value.");
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      setError("Enter a valid non-negative number.");
      showError("Enter a valid non-negative number.");
      return;
    }
    openConfirm({
      title: "Confirm Gold Rate Update",
      message:
        "Are you sure you want to update the gold rate? This will affect pricing immediately.",
      confirmLabel: "Update",
      onConfirm: performSave,
    });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminCard title="Gold Rate" description="Manage the current gold rate.">
          <p className="text-sm text-zinc-500">Loading...</p>
        </AdminCard>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <AdminCard
          title="Current Gold Rate"
          description="Latest rate stored in Firestore (GoldRate/currentRate)."
        >
          <div className="space-y-1">
            <p className="text-3xl font-semibold tracking-tight text-zinc-900">
              {currentRate.rate != null ? currentRate.rate.toLocaleString() : "-"}
            </p>
            <p className="text-sm text-zinc-500">
              Last updated {formatDateTime(currentRate.updatedAt)}
              {currentRate.updatedBy ? ` by ${currentRate.updatedBy}` : ""}
            </p>
          </div>
        </AdminCard>

        <AdminCard
          title="Update Rate"
          description="Set a new gold rate. Changes apply immediately."
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                New gold rate
              </label>
              <input
                type="number"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="e.g. 167000"
                className="w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
              />
            </div>
            <AdminButton
              variant="primary"
              onClick={handleSaveClick}
              disabled={saving || !canEditGoldRate}
            >
              {saving ? "Saving…" : "Update rate"}
            </AdminButton>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {success}
              </div>
            )}
          </div>
        </AdminCard>

        <AdminCard
          title="History"
          description="Recent gold rate changes."
        >
          {historyLoading ? (
            <p className="text-sm text-zinc-500">Loading history...</p>
          ) : (
            <AdminTable>
              <thead>
                <AdminTableHeaderRow>
                  <AdminTableHeaderCell>Rate</AdminTableHeaderCell>
                  <AdminTableHeaderCell>Updated At</AdminTableHeaderCell>
                  <AdminTableHeaderCell>Updated By</AdminTableHeaderCell>
                </AdminTableHeaderRow>
              </thead>
              <AdminTableBody>
                {history.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={3} className="text-center text-zinc-500">
                      No history yet
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  history.map((entry, i) => (
                    <AdminTableRow key={i}>
                      <AdminTableCell>
                        {entry.rate != null ? entry.rate.toLocaleString() : "-"}
                      </AdminTableCell>
                      <AdminTableCell>{formatDateTime(entry.updatedAt)}</AdminTableCell>
                      <AdminTableCell className="max-w-[200px] truncate">
                        {entry.updatedBy ?? "-"}
                      </AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCard>
      </div>
      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}
