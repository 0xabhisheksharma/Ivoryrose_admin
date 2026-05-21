"use client";

import type { InputHTMLAttributes } from "react";
import { AdminIcon } from "./AdminIcons";

type AdminSearchProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

/**
 * AdminSearch is a reusable search/filter input commonly placed above tables.
 * It is a controlled input; pass `value` and `onChange` from the page state.
 */
export function AdminSearch({ label, className = "", ...props }: AdminSearchProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </label>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <AdminIcon name="search" className="h-4 w-4" />
        </span>
        <input
          {...props}
          className={
            "w-full rounded-md border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none ring-0 transition focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 " +
            className
          }
        />
      </div>
    </div>
  );
}
