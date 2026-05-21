"use client";

import type { ReactNode } from "react";

type AdminDrawerProps = {
  open: boolean;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
};

export function AdminDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: AdminDrawerProps) {
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
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "admin-drawer-title" : undefined}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-slate-700 bg-[#0F172A] text-[#E5E7EB] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="border-b border-slate-700 px-5 py-4">
            {title && (
              <h2
                id="admin-drawer-title"
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
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-slate-700 bg-[#020617] px-5 py-3">
            <div className="flex justify-end gap-2">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

