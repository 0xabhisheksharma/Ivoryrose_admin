"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSyncTags } from "@/presentation/features/sync/hooks/useSyncTags";
import { useSyncRates } from "@/presentation/features/sync/hooks/useSyncRates";
import { useProductImport } from "@/presentation/features/sync/hooks/useProductImport";
import { useGoldRate } from "@/presentation/features/rates/hooks/useGoldRate";
import { useToast } from "@/presentation/components/ui/ToastContext";
import { useConfirmAction } from "@/presentation/components/ui/useConfirmAction";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { Card, CardHeader, CardContent } from "@/presentation/components/ui/Card";
import { Button } from "@/presentation/components/ui/Button";
import { parseDriveFolderId } from "@/shared/utils/drive";
import { AdminIcon } from "@/presentation/components/admin/AdminIcons";

const RATE_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1kcrnR223X3kKcLkiwHRjQ7KP9pQs19axdAWfbXPBVLI/edit?usp=drive_link";

const ALL_PRODUCTS_FOLDER_URL =
  "https://drive.google.com/drive/folders/1J3PtI1ijQJrp_W2xhp8rakL7oeXh3cC7";
function getDriveFolderStatus(value: string): {
  folderId: string | null;
  isInvalid: boolean;
} {
  const trimmed = value.trim();
  if (!trimmed) return { folderId: null, isInvalid: false };
  const folderId = parseDriveFolderId(trimmed);
  return { folderId, isInvalid: folderId === null };
}

export function AdminBulkUtilities() {
  const [driveLink, setDriveLink] = useState("");
  const [rateDriveLink, setRateDriveLink] = useState("");
  const [productImportDriveLink, setProductImportDriveLink] = useState("");

  const { runSync, loading, result, error } = useSyncTags();
  const { runSync: runRateSync, loading: rateLoading, result: rateResult, error: rateError } = useSyncRates();
  const { runImport, loading: productImportLoading, result: productImportResult, error: productImportError } =
    useProductImport();
  const {
    rate: goldRate,
    inputVal: goldRateInput,
    setInputVal: setGoldRateInput,
    loading: goldRateLoading,
    saving: goldRateSaving,
    error: goldRateError,
    success: goldRateSuccess,
    saveRate: handleSaveGoldRate,
  } = useGoldRate();

  const { showSuccess, showError } = useToast();
  const { openConfirm, confirmDialogProps } = useConfirmAction();

  const [tagValidationError, setTagValidationError] = useState<string | null>(null);
  const [rateValidationError, setRateValidationError] = useState<string | null>(null);
  const [productImportValidationError, setProductImportValidationError] = useState<string | null>(null);
  const productImportFolderStatus = useMemo(
    () => getDriveFolderStatus(productImportDriveLink),
    [productImportDriveLink]
  );
  function handleTagUpdateClick() {
    const trimmed = driveLink.trim();
    setTagValidationError(null);
    if (!trimmed) {
      setTagValidationError("Please enter a Google Drive or spreadsheet link.");
      return;
    }
    openConfirm({
      title: "Confirm Tag Update",
      message:
        "This will sync tags from the Drive folder and update Firestore product documents. Existing product tag data may be overwritten. Continue?",
      confirmLabel: "Update",
      onConfirm: async () => {
        const out = await runSync({ driveLink: trimmed });
        if (out.ok) showSuccess(`Tags synced. Updated: ${out.result.updated}, Skipped: ${out.result.skipped}.`);
        else showError(out.error);
      },
    });
  }

  function handleTagSyncClick() {
    setTagValidationError(null);
    openConfirm({
      title: "Confirm Tag Sync",
      message:
        "This will sync tags from the default source and update Firestore product documents. Continue?",
      confirmLabel: "Sync",
      onConfirm: async () => {
        const out = await runSync({});
        if (out.ok) showSuccess(`Tags synced. Updated: ${out.result.updated}, Skipped: ${out.result.skipped}.`);
        else showError(out.error);
      },
    });
  }

  function handleUpdateRatesClick() {
    const trimmed = rateDriveLink.trim();
    setRateValidationError(null);
    if (!trimmed) {
      setRateValidationError("Please enter a Google Drive or spreadsheet link.");
      return;
    }
    openConfirm({
      title: "Confirm Rate Update",
      message:
        "This will sync rates from the provided source into Firebase. Existing rates may be replaced. Continue?",
      confirmLabel: "Update rates",
      onConfirm: async () => {
        const out = await runRateSync(trimmed);
        if (out.ok) showSuccess(`Rates synced. Written: ${out.result.written}, Total: ${out.result.total}.`);
        else showError(out.error);
      },
    });
  }

  function handleRunProductImportClick() {
    const trimmed = productImportDriveLink.trim();
    setProductImportValidationError(null);
    if (productImportFolderStatus.isInvalid) {
      setProductImportValidationError("Please paste a valid Google Drive folder link or folder ID.");
      return;
    }
    openConfirm({
      title: "Confirm Product Import",
      message:
        "This will import products from the Drive folder. Firestore and Storage will be updated. This may overwrite existing product data. Continue?",
      confirmLabel: "Run import",
      onConfirm: async () => {
        const out = await runImport(trimmed || undefined);
        if (out.ok) {
          const nDrive = out.result.driveSyncErrors?.length ?? 0;
          showSuccess(
            nDrive > 0
              ? `Import complete. Created: ${out.result.created}, Updated: ${out.result.updated}. Drive write issues: ${nDrive} product(s) - see summary below.`
              : `Import complete. Created: ${out.result.created}, Updated: ${out.result.updated}.`
          );
        } else showError(out.error);
      },
    });
  }

  function handleSaveGoldRateClick() {
    const trimmed = goldRateInput.trim();
    if (!trimmed) {
      showError("Enter a gold rate value.");
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      showError("Please enter a valid non-negative number.");
      return;
    }
    openConfirm({
      title: "Confirm Gold Rate Update",
      message:
        "Are you sure you want to update the gold rate? This will affect pricing immediately.",
      confirmLabel: "Update",
      onConfirm: async () => {
        const out = await handleSaveGoldRate();
        if (out.ok) showSuccess("Gold rate updated.");
        else showError(out.error);
      },
    });
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Ivory Admin</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <span>Quick links:</span>
          <Link
            href="/admin/products"
            className="font-medium text-zinc-700 underline hover:text-zinc-900"
          >
            Products
          </Link>
          <span className="text-zinc-400">|</span>
          <Link
            href="/admin/rates"
            className="font-medium text-zinc-700 underline hover:text-zinc-900"
          >
            Rates
          </Link>
          <span className="text-zinc-400">|</span>
          <Link
            href="/admin/gold-rate"
            className="font-medium text-zinc-700 underline hover:text-zinc-900"
          >
            Gold Rate
          </Link>
        </p>
      </header>

      <section className="space-y-6">
        {/* Tag Update */}
        <Card>
          <CardHeader
            title="Tag Update"
            description={
              'Downloads the tags Excel or spreadsheet, reads the "375 tags" sheet, and updates Firestore product documents.'
            }
          />
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Google Drive or spreadsheet link
              </label>
              <input
                type="url"
                value={driveLink}
              onChange={(e) => {
                setDriveLink(e.target.value);
                setTagValidationError(null);
              }}
                placeholder="https://drive.google.com/... or https://docs.google.com/spreadsheets/d/..."
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Paste a Google Drive folder or spreadsheet link to use that source for Update.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={handleTagUpdateClick}
                disabled={loading}
                className="inline-flex items-center gap-2"
              >
                <AdminIcon name="refresh" className="h-4 w-4 shrink-0" />
                {loading ? "Updating..." : "Update"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleTagSyncClick}
                disabled={loading}
                className="inline-flex items-center gap-2"
              >
                <AdminIcon name="refresh" className="h-4 w-4 shrink-0" />
                {loading ? "Syncing..." : "Sync"}
              </Button>
            </div>
            {(error || tagValidationError) && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {tagValidationError ?? error}
              </div>
            )}
            {result && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900">Summary</h3>
                <ul className="space-y-1 text-sm text-zinc-700">
                  <li>Total rows processed: {result.total}</li>
                  <li>Updated: {result.updated}</li>
                  <li>Skipped: {result.skipped}</li>
                  <li>Not found: {result.not_found}</li>
                  <li>Errors: {result.errors}</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gold Rate */}
        <Card>
          <CardHeader
            title="Gold Rate (Firestore)"
            description="The current gold rate is stored in Firestore at GoldRate/currentRate. Update it here to change the live rate."
          />
          <CardContent className="space-y-4">
            <p className="text-sm text-zinc-700">
              Current rate:{" "}
              {goldRateLoading && goldRate === null
                ? "Loading..."
                : goldRate !== null
                ? goldRate
                : "-"}
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                New gold rate
              </label>
              <input
                type="number"
                value={goldRateInput}
                onChange={(e) => setGoldRateInput(e.target.value)}
                placeholder="Enter gold rate, e.g. 167000"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500"
              />
            </div>
            <Button
              variant="primary"
              onClick={handleSaveGoldRateClick}
              disabled={goldRateSaving || goldRateLoading}
              className="inline-flex items-center gap-2"
            >
              <AdminIcon name="save" className="h-4 w-4 shrink-0" />
              {goldRateSaving ? "Saving..." : "Save rate"}
            </Button>
            {goldRateError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {goldRateError}
              </div>
            )}
            {goldRateSuccess && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {goldRateSuccess}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate Update */}
        <Card>
          <CardHeader
            title="Rate Update"
            description="The rate sync reads from a Google Sheet and updates the Firestore Rate collection. Edit the sheet to change rates."
          />
          <CardContent className="space-y-4">
            <a
              href={RATE_SPREADSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <AdminIcon name="external" className="h-4 w-4 shrink-0" />
              Open Rate spreadsheet
            </a>
            <p className="text-sm text-zinc-600">
              Or provide a Google Drive link (spreadsheet or folder) to sync rates from that source into Firebase.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Google Drive or spreadsheet link
              </label>
              <input
                type="url"
                value={rateDriveLink}
                onChange={(e) => {
                  setRateDriveLink(e.target.value);
                  setRateValidationError(null);
                }}
                placeholder="https://drive.google.com/... or https://docs.google.com/spreadsheets/d/..."
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500"
              />
            </div>
            <Button
              variant="primary"
              onClick={handleUpdateRatesClick}
              disabled={rateLoading}
              className="inline-flex items-center gap-2"
            >
              <AdminIcon name="refresh" className="h-4 w-4 shrink-0" />
              {rateLoading ? "Updating rates..." : "Update rates"}
            </Button>
            {(rateError || rateValidationError) && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {rateValidationError ?? rateError}
              </div>
            )}
            {rateResult && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">Rate sync summary</h3>
                <ul className="space-y-1 text-sm text-zinc-700">
                  <li>Deleted: {rateResult.deleted}</li>
                  <li>Written: {rateResult.written}</li>
                  <li>Total rows: {rateResult.total}</li>
                  <li>Skipped: {rateResult.skipped}</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Import */}
        <Card>
          <CardHeader
            title="Product Import"
            description="Import products from a Google Drive folder (All Products). For each product, reads Excel and images, updates Firestore and uploads images to Storage. After each successful create or update, the same Excel and image files are written back to that folder (Google Sheets are exported as .xlsx alongside)."
          />
          <CardContent className="space-y-4">
            <a
              href={ALL_PRODUCTS_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 underline"
            >
              <AdminIcon name="external" className="h-4 w-4 shrink-0" />
              Default folder (All Products)
            </a>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Google Drive folder link
              </label>
              <input
                type="url"
                value={productImportDriveLink}
                onChange={(e) => {
                  setProductImportDriveLink(e.target.value);
                  setProductImportValidationError(null);
                }}
                placeholder="https://drive.google.com/drive/folders/..."
                className={
                  "w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 " +
                  (productImportFolderStatus.isInvalid
                    ? "border-red-300 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    : "border-zinc-300 focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20")
                }
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {productImportFolderStatus.folderId ? (
                  <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                    Folder detected: {productImportFolderStatus.folderId}
                  </span>
                ) : productImportFolderStatus.isInvalid ? (
                  <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">
                    This does not look like a Google Drive folder link.
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    Leave blank to import from the default All Products folder.
                  </span>
                )}
                {productImportDriveLink.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductImportDriveLink("");
                      setProductImportValidationError(null);
                    }}
                    className="font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleRunProductImportClick}
              disabled={productImportLoading || productImportFolderStatus.isInvalid}
              className="inline-flex items-center gap-2"
            >
              <AdminIcon name="refresh" className="h-4 w-4 shrink-0" />
              {productImportLoading ? "Running import..." : "Run import"}
            </Button>
            {(productImportError || productImportValidationError) && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {productImportValidationError ?? productImportError}
              </div>
            )}
            {productImportResult && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">Product import summary</h3>
                <ul className="space-y-1 text-sm text-zinc-700">
                  <li>Total: {productImportResult.total}</li>
                  <li>Created: {productImportResult.created}</li>
                  <li>Updated: {productImportResult.updated}</li>
                  <li>Skipped: {productImportResult.skipped}</li>
                  <li>Errored: {productImportResult.errored}</li>
                </ul>
                {productImportResult.driveSyncErrors &&
                  productImportResult.driveSyncErrors.length > 0 && (
                    <div className="mt-3 border-t border-amber-200 pt-3">
                      <p className="mb-2 text-sm font-medium text-amber-900">
                        Drive sync warnings ({productImportResult.driveSyncErrors.length})
                      </p>
                      <p className="mb-2 text-xs text-zinc-600">
                        Firestore was updated; these products had errors writing Excel or images back to
                        the folder. If the error mentions service account storage quota, use a Shared
                        Drive folder, or set environment variable GOOGLE_DRIVE_IMPERSONATE_USER to a
                        Workspace user and enable domain-wide delegation for scope
                        https://www.googleapis.com/auth/drive. Otherwise share the folder with the service
                        account as Editor and ensure the Drive API is enabled.
                      </p>
                      <ul className="max-h-40 space-y-2 overflow-y-auto text-xs text-amber-900">
                        {productImportResult.driveSyncErrors.map((e, i) => (
                          <li key={`${e.productId}-${i}`} className="break-words">
                            <span className="font-mono font-medium">{e.productId}</span>: {e.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}
