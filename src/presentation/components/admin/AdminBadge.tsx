"use client";

import type { ReactNode } from "react";

type AdminBadgeVariant = "default" | "success" | "warning" | "danger" | "info";

type AdminBadgeProps = {
  children: ReactNode;
  variant?: AdminBadgeVariant;
  className?: string;
};

const variantClasses: Record<AdminBadgeVariant, string> = {
  default:
    "border-zinc-200 bg-zinc-100 text-zinc-700",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800",
  danger:
    "border-red-200 bg-red-50 text-red-700",
  info:
    "border-sky-200 bg-sky-50 text-sky-700",
};

/**
 * AdminBadge is a small pill used to highlight statuses such as Active/Inactive.
 * Choose a variant to map to semantic meaning; content comes from the caller.
 */
export function AdminBadge({
  children,
  variant = "default",
  className = "",
}: AdminBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
