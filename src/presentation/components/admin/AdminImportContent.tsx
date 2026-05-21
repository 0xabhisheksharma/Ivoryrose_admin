"use client";

import { useEffect, useMemo, useState } from "react";
import { useImport } from "@/presentation/features/sync/hooks/useImport";
import { useToast } from "@/presentation/components/ui/ToastContext";
import { useConfirmAction } from "@/presentation/components/ui/useConfirmAction";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { Card, CardHeader, CardContent } from "@/presentation/components/ui/Card";
import { Button } from "@/presentation/components/ui/Button";
import { AdminIcon } from "@/presentation/components/admin/AdminIcons";

const LOCAL_IMPORT_FOLDER_KEY = "ivory-admin.localImport.folderPath";

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClasses = {
    neutral: "border-zinc-200 bg-white text-zinc-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  };

  return (
    <div className={`rounded-md border px-3 py-3 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

export function AdminImportContent() {
  const [folderPath, setFolderPath] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(LOCAL_IMPORT_FOLDER_KEY) ?? ""
  );
  const [destinationFolderLink, setDestinationFolderLink] = useState(() =>
    typeof window === "undefined" ? "" : ""
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const {
    runImport,
    previewImport,
    clearPreview,
    loading,
    previewLoading,
    result,
    preview,
    error,
    previewError,
  } = useImport();
  const { showSuccess, showError } = useToast();
  const { openConfirm, confirmDialogProps } = useConfirmAction();

  useEffect(() => {
    window.localStorage.setItem(LOCAL_IMPORT_FOLDER_KEY, folderPath);
  }, [folderPath]);

  const importStatus = useMemo(() => {
    if (!result) return null;
    if (result.errors.length > 0) return "Completed with errors";
    if (result.driveSyncErrors.length > 0 || (result.quoteErrors?.length ?? 0) > 0) {
      return "Completed with warnings";
    }
    return "Completed";
  }, [result]);

  async function handleCheckFolderClick() {
    const trimmed = folderPath.trim();
    setValidationError(null);
    if (!trimmed) {
      setValidationError("Please enter a local folder path.");
      return;
    }
    const out = await previewImport(trimmed, destinationFolderLink);
    if (!out.ok) {
      showError(out.error);
    }
  }

  function handleImportClick() {
    const trimmed = folderPath.trim();
    setValidationError(null);
    if (!trimmed) {
      setValidationError("Please enter a local folder path.");
      return;
    }
    if (!destinationFolderLink.trim()) {
      setValidationError("Please enter the Google Drive destination folder link.");
      return;
    }
    if (preview && preview.htmlFiles === 0) {
      setValidationError("This folder check found no product HTML files.");
      return;
    }
    openConfirm({
      title: "Confirm Import",
      message:
        preview
          ? `This will import about ${preview.estimatedProducts} product(s), upload assets to Drive, and generate quotations for created or updated products. Continue?`
          : "This will import local products, upload assets to Drive, and generate quotations for created or updated products. Continue?",
      confirmLabel: "Import",
      onConfirm: async () => {
        const out = await runImport(trimmed, destinationFolderLink);
        if (out.ok) {
          showSuccess(
            `Import complete. Created: ${out.result.created}, Updated: ${out.result.updated}. Products with tags: ${out.result.tagOverridesApplied ?? 0}. Quotations generated: ${out.result.quotesGenerated ?? 0}.`
          );
        } else {
          showError(out.error);
        }
      },
    });
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Import</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Create or update products from local HTML, CAD details, and ZIP image files.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Local Product Import"
          description="Each product HTML provides product identity and tags; the matching ZIP provides product images; the CAD Details sheet link in HTML is downloaded and processed."
        />
        <CardContent className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Local folder path
            </label>
            <input
              type="text"
              value={folderPath}
              onChange={(event) => {
                setFolderPath(event.target.value);
                setValidationError(null);
                clearPreview();
              }}
              placeholder="C:\Path\To\ImportFolder"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Quotes and file URLs are accepted; the path is checked from the machine running this admin app.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Google Workspace Shared Drive destination folder
            </label>
            <input
              type="url"
              value={destinationFolderLink}
              onChange={(event) => {
                setDestinationFolderLink(event.target.value);
                setValidationError(null);
                clearPreview();
              }}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Use a Shared Drive folder shared with the Google service account as Content manager.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleCheckFolderClick}
              disabled={loading || previewLoading}
              className="inline-flex items-center gap-2"
            >
              <AdminIcon name="folder" className="h-4 w-4 shrink-0" />
              {previewLoading ? "Checking..." : "Check folder"}
            </Button>
            <Button
              variant="primary"
              onClick={handleImportClick}
              disabled={loading || previewLoading}
              className="inline-flex items-center gap-2"
            >
              <AdminIcon name="refresh" className="h-4 w-4 shrink-0" />
              {loading ? "Importing..." : "Import"}
            </Button>
          </div>

          {(error || previewError || validationError) && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {validationError ?? previewError ?? error}
            </div>
          )}

          {preview && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Folder check</h3>
                  <p className="mt-1 break-words text-xs text-zinc-500">{preview.folderPath}</p>
                </div>
                <span className="inline-flex w-fit items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  <AdminIcon name="check" className="h-3.5 w-3.5" />
                  Ready to review
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryTile label="Products" value={preview.estimatedProducts} tone={preview.estimatedProducts > 0 ? "success" : "danger"} />
                <SummaryTile label="HTML" value={preview.htmlFiles} />
                <SummaryTile label="ZIP" value={preview.zipFiles} tone={preview.zipFiles > 0 ? "neutral" : "warning"} />
                <SummaryTile label="Folders" value={preview.folders} />
                <SummaryTile label="Files" value={preview.totalFiles} />
              </div>
              {preview.driveDestinationFolderId && (
                <p className="mt-3 break-words text-xs text-zinc-500">
                  Destination folder ID: <span className="font-mono">{preview.driveDestinationFolderId}</span>
                </p>
              )}
              {preview.sampleHtmlFiles.length > 0 && (
                <div className="mt-3 border-t border-zinc-200 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sample HTML files</p>
                  <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                    {preview.sampleHtmlFiles.map((file) => (
                      <li key={file} className="break-words font-mono">{file}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-amber-100 pt-3 text-xs text-amber-800">
                  {preview.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <AdminIcon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">Import summary</h3>
                {importStatus && (
                  <span className="text-xs font-medium text-zinc-500">{importStatus}</span>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile label="Total" value={result.total} />
                <SummaryTile label="Created" value={result.created} tone="success" />
                <SummaryTile label="Updated" value={result.updated} />
                <SummaryTile label="Skipped" value={result.skipped} />
                <SummaryTile label="Tags" value={result.tagOverridesApplied ?? 0} />
                <SummaryTile label="Quotes" value={result.quotesGenerated ?? 0} tone="success" />
                <SummaryTile label="Errors" value={result.errors.length} tone={result.errors.length > 0 ? "danger" : "neutral"} />
                <SummaryTile
                  label="Warnings"
                  value={result.driveSyncErrors.length + (result.quoteErrors?.length ?? 0)}
                  tone={result.driveSyncErrors.length + (result.quoteErrors?.length ?? 0) > 0 ? "warning" : "neutral"}
                />
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-red-100 pt-3 text-xs text-red-700">
                  {result.errors.map((e, index) => (
                    <li key={`${e.productId}-${index}`} className="break-words">
                      <span className="font-mono font-medium">{e.productId}</span>: {e.error}
                    </li>
                  ))}
                </ul>
              )}
              {result.driveSyncErrors.length > 0 && (
                <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-amber-100 pt-3 text-xs text-amber-800">
                  {result.driveSyncErrors.map((e, index) => (
                    <li key={`${e.productId}-${index}`} className="break-words">
                      <span className="font-mono font-medium">{e.productId}</span>: {e.error}
                    </li>
                  ))}
                </ul>
              )}
              {result.quoteErrors && result.quoteErrors.length > 0 && (
                <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-amber-100 pt-3 text-xs text-amber-800">
                  {result.quoteErrors.map((e, index) => (
                    <li key={`quote-${e.productId}-${index}`} className="break-words">
                      <span className="font-mono font-medium">{e.productId}</span> (quotation): {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}
