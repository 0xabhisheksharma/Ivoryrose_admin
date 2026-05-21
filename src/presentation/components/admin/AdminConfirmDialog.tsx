"use client";

import { useEffect, useRef } from "react";
import { AdminButton } from "./AdminButton";
import { AdminModal } from "./AdminModal";

type AdminConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * AdminConfirmDialog standardizes confirm flows for important or destructive actions.
 * It is built on top of AdminModal and keeps all behavior in the calling code.
 */
export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}: AdminConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      prevOpen.current = true;
      setTimeout(() => confirmRef.current?.focus(), 0);
    }
    if (!open) prevOpen.current = open;
  }, [open]);

  async function handleConfirm() {
    if (loading) return;
    await onConfirm();
  }

  return (
    <AdminModal
      open={open}
      title={title}
      description={description}
      onClose={loading ? undefined : onCancel}
      footer={
        <>
          <AdminButton
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </AdminButton>
          <AdminButton
            ref={confirmRef as never}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </AdminButton>
        </>
      }
    >
      {/* Body content is described by description; no extra fields by default. */}
    </AdminModal>
  );
}

