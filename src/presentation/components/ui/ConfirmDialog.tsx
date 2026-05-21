"use client";

import { useEffect, useRef } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
}: ConfirmDialogProps) {
  const previousOpen = useRef(open);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && !previousOpen.current) {
      previousOpen.current = true;
      setTimeout(() => confirmButtonRef.current?.focus(), 0);
    }
    if (!open) previousOpen.current = open;
  }, [open]);

  if (!open) return null;

  async function handleConfirm() {
    if (loading) return;
    await onConfirm();
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !loading) onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && !loading) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-zinc-900/45 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-zinc-900"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-message"
          className="mt-2 text-sm leading-6 text-zinc-600"
        >
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-md bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#111827] hover:bg-[#caa42f] disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#111827] border-t-transparent"
                  aria-hidden
                />
                Working...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
