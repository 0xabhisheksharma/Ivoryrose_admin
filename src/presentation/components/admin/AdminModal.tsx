"use client";

import type { ReactNode } from "react";

type AdminModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
};

/**
 * AdminModal is a generic overlay used for forms and confirmations.
 * It does not own any state; callers control `open` and `onClose`.
 */
export function AdminModal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: AdminModalProps) {
  if (!open) return null;

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") onClose?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "admin-modal-title" : undefined}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#111827] text-[#E5E7EB] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="border-b border-slate-700 px-5 py-4">
            {title && (
              <h2
                id="admin-modal-title"
                className="text-base font-semibold tracking-tight"
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            )}
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-slate-700 bg-[#0F172A] px-5 py-3">
            <div className="flex justify-end gap-2">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
