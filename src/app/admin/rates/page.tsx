"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/presentation/components/ui/ToastContext";
import { useConfirmAction } from "@/presentation/components/ui/useConfirmAction";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { Card, CardHeader } from "@/presentation/components/ui/Card";
import { Button } from "@/presentation/components/ui/Button";
import { useAuth } from "@/presentation/auth/AuthContext";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

type RateRow = {
  rateId: string;
  TYP: string;
  SHP: string;
  Band: string;
  Rs_Rate: number | null;
  updatedAt: string | null;
};

function IconEdit() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

export default function AdminRatesPage() {
  const authFetch = useAuthenticatedFetch();
  const { can } = useAuth();
  const canEditRates = can("rates.write");
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [saving, setSaving] = useState(false);

  const { showSuccess, showError } = useToast();
  const { openConfirm, confirmDialogProps } = useConfirmAction();

  const loadRates = useCallback(() => {
    setLoading(true);
    setError(null);
    authFetch("/api/admin/rates")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setRates(data);
        else setError((data as { error?: string }).error ?? "Failed to load");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Request failed"))
      .finally(() => setLoading(false));
  }, [authFetch]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  function startEdit(r: RateRow) {
    setEditingId(r.rateId);
    setEditRate(r.Rs_Rate != null ? String(r.Rs_Rate) : "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function performSave() {
    if (!editingId) return;
    const num = editRate.trim() === "" ? null : Number(editRate);
    if (num !== null && !Number.isFinite(num)) {
      setError("Enter a valid number");
      showError("Enter a valid number");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/rates/${encodeURIComponent(editingId)}`, {
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
      setEditingId(null);
      loadRates();
      showSuccess("Rate updated.");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Request failed";
      setError(errMsg);
      showError(errMsg);
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (!editingId || !canEditRates) return;
    const num = editRate.trim() === "" ? null : Number(editRate);
    if (num !== null && !Number.isFinite(num)) {
      setError("Enter a valid number");
      showError("Enter a valid number");
      return;
    }
    openConfirm({
      title: "Confirm Rate Update",
      message: "Are you sure you want to update this rate? The change will take effect immediately.",
      confirmLabel: "Update",
      onConfirm: performSave,
    });
  }

  if (loading) {
    return (
      <Card>
        <CardHeader title="Rates" />
        <div className="p-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Rates"
          description="Edit rate values in Firestore. Rate sync from Google Sheet is unchanged."
        />
        {error && (
          <div className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">rateId</th>
                <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">TYP</th>
                <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">SHP</th>
                <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Band</th>
                <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Rs_Rate</th>
                <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Last updated</th>
                <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) =>
                editingId === r.rateId ? (
                  <tr key={r.rateId} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-zinc-500">
                      {r.rateId}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.TYP}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.SHP}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.Band}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        placeholder="Rate value"
                        className="w-28 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">—</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          onClick={handleSaveClick}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs"
                        >
                          {saving ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={cancelEdit}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.rateId} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                      {r.rateId}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.TYP}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.SHP}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.Band}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {r.Rs_Rate != null ? r.Rs_Rate : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="secondary"
                        onClick={() => startEdit(r)}
                        disabled={!canEditRates}
                        className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs"
                      >
                        <IconEdit />
                        {canEditRates ? "Edit" : "No access"}
                      </Button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        {rates.length === 0 && !loading && (
          <p className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No rates found.</p>
        )}
      </Card>
      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}
