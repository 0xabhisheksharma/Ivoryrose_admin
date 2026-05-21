"use client";

import type { ReactNode } from "react";

type AdminCardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
};

/**
 * AdminCard provides a standardized dark-themed container for admin sections.
 * Use it anywhere you currently render a bordered card in admin pages.
 */
export function AdminCard({
  title,
  description,
  actions,
  children,
  className = "",
  headerClassName = "",
  bodyClassName = "",
}: AdminCardProps) {
  return (
    <section
      className={
        "overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-sm shadow-zinc-200/50 " +
        className
      }
    >
      {(title || description || actions) && (
        <header
          className={
            "flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4 " +
            headerClassName
          }
        >
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold tracking-tight text-zinc-900">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-zinc-600">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      <div className={"px-5 py-5 " + bodyClassName}>{children}</div>
    </section>
  );
}
