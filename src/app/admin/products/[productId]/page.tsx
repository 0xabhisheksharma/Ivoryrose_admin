"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ProductWithRows } from "@/domain/types";
import { useToast } from "@/presentation/components/ui/ToastContext";
import { useConfirmAction } from "@/presentation/components/ui/useConfirmAction";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { Card, CardHeader, CardContent } from "@/presentation/components/ui/Card";
import { Button } from "@/presentation/components/ui/Button";
import { useAuth } from "@/presentation/auth/AuthContext";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

function ImagePreview({ url, index }: { url: string; index: number }) {
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
        {error ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
            Failed to load
          </div>
        ) : (
          <img
            src={url}
            alt={`Product image ${index + 1}`}
            className="h-full w-full object-cover"
            onError={() => setError(true)}
          />
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 max-w-[6rem] truncate text-xs text-zinc-500 hover:underline dark:text-zinc-400"
      >
        {index + 1}
      </a>
    </div>
  );
}

export default function AdminProductEditPage() {
  const authFetch = useAuthenticatedFetch();
  const { can } = useAuth();
  const canEditProduct = can("products.write");
  const params = useParams();
  const productId = typeof params?.productId === "string" ? params.productId : "";
  const [data, setData] = useState<ProductWithRows | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [materialsStr, setMaterialsStr] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [stoneSummaryStr, setStoneSummaryStr] = useState("");
  const [assumingNetWt, setAssumingNetWt] = useState("");
  const [imagesStr, setImagesStr] = useState("");

  const [rowsEditMode, setRowsEditMode] = useState(false);
  const [editableRows, setEditableRows] = useState<Record<string, unknown>[]>([]);
  const [savingRows, setSavingRows] = useState(false);
  const [rowsSuccess, setRowsSuccess] = useState<string | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const { showSuccess, showError } = useToast();
  const { openConfirm, confirmDialogProps } = useConfirmAction();

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/admin/products/${encodeURIComponent(productId)}`);
        const raw = await res.json();
        if (!res.ok) {
          setError((raw as { error?: string }).error ?? "Failed to load product");
          return;
        }
        const d = raw as ProductWithRows;
        if (!cancelled) {
          setData(d);
          setCategory(d.category ?? "");
          setTagsStr(Array.isArray(d.tags) ? d.tags.join(", ") : "");
          setMaterialsStr(Array.isArray(d.materials) ? d.materials.join(", ") : "");
          setIsActive(d.isActive ?? true);
          setStoneSummaryStr(
            d.stoneSummary != null ? JSON.stringify(d.stoneSummary, null, 2) : ""
          );
          setAssumingNetWt(
            d.assumingNetWt != null ? String(d.assumingNetWt) : ""
          );
          setImagesStr(Array.isArray(d.imageUrls) ? d.imageUrls.join("\n") : "");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authFetch, productId]);

  function startEditRows() {
    const rows = data?.rows ?? [];
    setEditableRows(
      rows.map((r) => ({ ...(r as Record<string, unknown>) }))
    );
    setRowsEditMode(true);
    setRowsError(null);
    setRowsSuccess(null);
  }

  function cancelEditRows() {
    setRowsEditMode(false);
    setRowsError(null);
    setRowsSuccess(null);
  }

  function addRow() {
    setEditableRows((prev) => [...prev, {}]);
  }

  function deleteRow(index: number) {
    setEditableRows((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmDeleteRow(index: number) {
    openConfirm({
      title: "Remove row?",
      message: "This removes the row from your pending edits. Save rows to apply the change.",
      confirmLabel: "Remove row",
      onConfirm: () => deleteRow(index),
    });
  }

  function updateEditableRow(
    index: number,
    field: string,
    value: string | number
  ) {
    setEditableRows((prev) => {
      const next = [...prev];
      const row = { ...(next[index] ?? {}) };
      const numFields = ["qty", "twt", "avWt"];
      row[field] = numFields.includes(field)
        ? (value === "" || value === null ? "" : Number(value))
        : value;
      next[index] = row;
      return next;
    });
  }

  async function saveRows() {
    if (!productId) return;
    setSavingRows(true);
    setRowsError(null);
    setRowsSuccess(null);
    try {
      const numKeys = ["qty", "twt", "avWt"];
      const rowsToSave = editableRows.map((r) => {
        const out: Record<string, unknown> = {};
        const keys = [
          "typ",
          "shp",
          "qly",
          "lot",
          "band",
          "mmSize",
          "avWt",
          "qty",
          "twt",
          "location",
          "remarks",
        ];
        for (const k of keys) {
          const v = r[k];
          if (v === undefined || v === "") continue;
          out[k] = numKeys.includes(k)
            ? (typeof v === "number" ? v : Number(v))
            : v;
          if (numKeys.includes(k) && Number.isNaN(out[k] as number))
            delete out[k];
        }
        return out;
      });
      const res = await authFetch(
        `/api/admin/products/${encodeURIComponent(productId)}/rows`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: rowsToSave }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        const errMsg = (result as { error?: string }).error ?? "Failed to save rows";
        setRowsError(errMsg);
        showError(errMsg);
        return;
      }
      setRowsSuccess("Rows saved.");
      showSuccess("Rows saved.");
      setRowsEditMode(false);
      const refetch = await authFetch(
        `/api/admin/products/${encodeURIComponent(productId)}`
      );
      const refetched = await refetch.json();
      if (refetch.ok && refetched) {
        setData(refetched as ProductWithRows);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Request failed";
      setRowsError(errMsg);
      showError(errMsg);
    } finally {
      setSavingRows(false);
    }
  }

  async function handleSave() {
    if (!productId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const tags = tagsStr
        .split(/[\n,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const materials = materialsStr
        .split(/[\n,]+/)
        .map((m) => m.trim())
        .filter(Boolean);
      let stoneSummary: unknown = undefined;
      if (stoneSummaryStr.trim()) {
        try {
          stoneSummary = JSON.parse(stoneSummaryStr) as unknown;
        } catch {
          const errMsg = "stoneSummary must be valid JSON";
          setError(errMsg);
          showError(errMsg);
          setSaving(false);
          return;
        }
      }
      const images = imagesStr
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        category: category || undefined,
        tags,
        materials,
        isActive,
        assumingNetWt: assumingNetWt === "" ? undefined : Number(assumingNetWt),
        images,
      };
      if (stoneSummary !== undefined) body.stoneSummary = stoneSummary;
      if (Number.isNaN(Number(assumingNetWt)) && assumingNetWt !== "")
        body.assumingNetWt = undefined;

      const res = await authFetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        const errMsg = (result as { error?: string }).error ?? "Save failed";
        setError(errMsg);
        showError(errMsg);
        return;
      }
      setSuccess("Saved.");
      showSuccess("Saved.");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Request failed";
      setError(errMsg);
      showError(errMsg);
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    openConfirm({
      title: "Confirm Update",
      message: "Are you sure you want to update this product? This change will immediately affect the product data.",
      confirmLabel: "Update",
      onConfirm: handleSave,
    });
  }

  function handleSaveRowsClick() {
    openConfirm({
      title: "Confirm Rows Update",
      message: "Are you sure you want to update the rows? This will replace the existing rows for this product.",
      confirmLabel: "Update",
      onConfirm: saveRows,
    });
  }

  if (loading) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent>
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
          <Link
            href="/admin/products"
            className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Back to products
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <div>
              <Link
                href="/admin/products"
                className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
              >
                ← Products
              </Link>
              <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Edit: {productId}
              </h2>
            </div>
            <Button
              variant="primary"
              onClick={handleSaveClick}
              disabled={saving || !canEditProduct}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                {success}
              </div>
            )}
            <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            category
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            tags (comma or newline separated)
          </label>
          <textarea
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            materials (comma or newline separated)
          </label>
          <textarea
            value={materialsStr}
            onChange={(e) => setMaterialsStr(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            isActive
          </label>
          <span
            className={
              isActive
                ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                : "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
            }
          >
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            stoneSummary (JSON)
          </label>
          <textarea
            value={stoneSummaryStr}
            onChange={(e) => setStoneSummaryStr(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            assumingNetWt
          </label>
          <input
            type="text"
            value={assumingNetWt}
            onChange={(e) => setAssumingNetWt(e.target.value)}
            placeholder="Number or leave empty"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            images (one URL per line)
          </label>
          <textarea
            value={imagesStr}
            onChange={(e) => setImagesStr(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {(() => {
            const urls = imagesStr
              .split("\n")
              .map((u) => u.trim())
              .filter(Boolean);
            if (urls.length === 0) return null;
            return (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Preview
                </p>
                <div className="flex flex-wrap gap-3">
                  {urls.map((url, i) => (
                    <ImagePreview key={i} url={url} index={i} />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Rows subcollection"
            description={
              data != null && !rowsEditMode && data.rowsUpdatedAt != null
                ? `Last updated: ${new Date(data.rowsUpdatedAt).toLocaleString()}`
                : undefined
            }
          />
          <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {!rowsEditMode ? (
              <Button variant="secondary" onClick={startEditRows} disabled={!canEditProduct}>
                {(data?.rows == null || (data?.rows?.length ?? 0) === 0)
                  ? "Add rows"
                  : "Edit rows"}
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={addRow}>
                  Add row
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveRowsClick}
                  disabled={savingRows}
                >
                  {savingRows ? "Saving…" : "Save rows"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={cancelEditRows}
                  disabled={savingRows}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          {rowsError && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {rowsError}
            </div>
          )}
          {rowsSuccess && (
            <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              {rowsSuccess}
            </div>
          )}
          {rowsEditMode ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <th className="px-2 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">typ</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">shp</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">qty</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">twt</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">qly</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">mmSize</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">remarks</th>
                    <th className="w-14 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {editableRows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={row.typ != null ? String(row.typ) : ""}
                          onChange={(e) =>
                            updateEditableRow(i, "typ", e.target.value)
                          }
                          className="w-full min-w-[4rem] rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={row.shp != null ? String(row.shp) : ""}
                          onChange={(e) =>
                            updateEditableRow(i, "shp", e.target.value)
                          }
                          className="w-full min-w-[4rem] rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.qty != null ? String(row.qty) : ""}
                          onChange={(e) =>
                            updateEditableRow(i, "qty", e.target.value)
                          }
                          className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.twt != null ? String(row.twt) : ""}
                          onChange={(e) =>
                            updateEditableRow(i, "twt", e.target.value)
                          }
                          className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={row.qly != null ? String(row.qly) : ""}
                          onChange={(e) =>
                            updateEditableRow(i, "qly", e.target.value)
                          }
                          className="w-full min-w-[4rem] rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={row.mmSize != null ? String(row.mmSize) : ""}
                          onChange={(e) =>
                            updateEditableRow(i, "mmSize", e.target.value)
                          }
                          className="w-full min-w-[4rem] rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={row.remarks != null ? String(row.remarks) : ""}
                          onChange={(e) =>
                            updateEditableRow(i, "remarks", e.target.value)
                          }
                          className="min-w-[6rem] rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Button
                          variant="danger"
                          onClick={() => confirmDeleteRow(i)}
                          className="px-2 py-1 text-xs"
                          title="Delete row"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : data?.rows == null || (data?.rows?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No rows data. Click &quot;Add rows&quot; to create rows.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">typ</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">shp</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">qty</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">twt</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">qly</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">mmSize</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((row, i) => {
                    const r = row as Record<string, unknown>;
                    return (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {r.typ != null ? String(r.typ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {r.shp != null ? String(r.shp) : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {r.qty != null ? String(r.qty) : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {r.twt != null ? String(r.twt) : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {r.qly != null ? String(r.qly) : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {r.mmSize != null ? String(r.mmSize) : "—"}
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400">
                          {r.remarks != null ? String(r.remarks) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}
