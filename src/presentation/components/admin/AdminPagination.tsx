"use client";

import { AdminButton } from "./AdminButton";

type AdminPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
};

/**
 * AdminPagination renders a footer with paging controls for long tables.
 * It is stateless; callers own page, pageSize, total, and handlers.
 */
export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions = [10, 25, 50],
  onPageSizeChange,
}: AdminPaginationProps) {
  const pageCount = total > 0 ? Math.ceil(total / pageSize) : 1;
  const canPrev = page > 1;
  const canNext = page < pageCount;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span>
          Showing{" "}
          <span className="font-medium text-zinc-900">
            {start}-{end}
          </span>{" "}
          of <span className="font-medium text-zinc-900">{total}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-800 focus:border-[var(--admin-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1">
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => canPrev && onPageChange(page - 1)}
            disabled={!canPrev}
          >
            Prev
          </AdminButton>
          <span className="px-1 text-[11px] text-zinc-500">
            Page{" "}
            <span className="font-semibold text-zinc-900">
              {page} / {pageCount}
            </span>
          </span>
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => canNext && onPageChange(page + 1)}
            disabled={!canNext}
          >
            Next
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
