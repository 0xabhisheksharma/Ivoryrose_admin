"use client";

import type {
  ReactNode,
  HTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
  HTMLAttributes as TrHTMLAttributes,
} from "react";

type AdminTableRootProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * AdminTable is a shell for data tables in the admin area.
 * Compose it with HeaderRow/HeaderCell/Row/Cell to mirror existing tables.
 */
export function AdminTable({ children, className = "", ...props }: AdminTableRootProps) {
  return (
    <div
      className={
        "overflow-x-auto rounded-lg border border-zinc-200 bg-white " +
        className
      }
      {...props}
    >
      <table className="w-full border-collapse text-left text-sm text-zinc-900">
        {children}
      </table>
    </div>
  );
}

type AdminTableHeaderRowProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTableHeaderRow({
  children,
  className = "",
}: AdminTableHeaderRowProps) {
  return (
    <tr
      className={
        "border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 " +
        className
      }
    >
      {children}
    </tr>
  );
}

type AdminTableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement>;

export function AdminTableHeaderCell({
  className = "",
  ...props
}: AdminTableHeaderCellProps) {
  return (
    <th
      className={
        "px-4 py-3 text-[11px] font-semibold text-zinc-700 " + className
      }
      {...props}
    />
  );
}

type AdminTableBodyProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTableBody({ children, className = "" }: AdminTableBodyProps) {
  return <tbody className={className}>{children}</tbody>;
}

type AdminTableRowProps = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
} & TrHTMLAttributes<HTMLTableRowElement>;

export function AdminTableRow({
  children,
  className = "",
  interactive = false,
  ...props
}: AdminTableRowProps) {
  return (
    <tr
      className={[
        "border-b border-zinc-100 last:border-0",
        interactive
          ? "cursor-pointer hover:bg-amber-50/50"
          : "hover:bg-zinc-50/60",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </tr>
  );
}

type AdminTableCellProps = TdHTMLAttributes<HTMLTableCellElement>;

export function AdminTableCell({ className = "", ...props }: AdminTableCellProps) {
  return (
    <td
      className={"px-4 py-3 align-middle text-sm text-zinc-900 " + className}
      {...props}
    />
  );
}
