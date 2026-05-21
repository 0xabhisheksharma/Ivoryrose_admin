"use client";

import type { ToastType } from "./ToastContext";

type ToastProps = {
  message: string;
  type: ToastType;
  onDismiss: () => void;
};

export function Toast({ message, type, onDismiss }: ToastProps) {
  const isSuccess = type === "success";
  return (
    <div
      role="alert"
      className={
        isSuccess
          ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950 dark:text-red-300"
      }
    >
      <div className="flex items-center justify-between gap-4">
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          aria-label="Dismiss"
        >
          <span className="sr-only">Dismiss</span>
          <span aria-hidden>×</span>
        </button>
      </div>
    </div>
  );
}
