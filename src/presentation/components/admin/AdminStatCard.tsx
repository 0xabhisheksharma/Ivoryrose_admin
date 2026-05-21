"use client";

import type { ReactNode } from "react";

type AdminStatCardProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  helperText?: string;
};

/**
 * AdminStatCard surfaces a single metric (e.g. counts, last sync) in a compact card.
 * Use it on admin dashboards; it is purely presentational.
 */
export function AdminStatCard({
  label,
  value,
  icon,
  helperText,
}: AdminStatCardProps) {
  return (
    <div className="flex min-h-[112px] items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 shadow-sm shadow-zinc-200/50">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-600">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">{value}</p>
        {helperText && (
          <p className="mt-1 text-xs text-zinc-500">{helperText}</p>
        )}
      </div>
      {icon && (
        <div className="ml-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
          {icon}
        </div>
      )}
    </div>
  );
}
