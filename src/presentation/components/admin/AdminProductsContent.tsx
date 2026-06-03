"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminBadge } from "@/presentation/components/admin/AdminBadge";
import { AdminButton } from "@/presentation/components/admin/AdminButton";
import { AdminCard } from "@/presentation/components/admin/AdminCard";
import { AdminIcon } from "@/presentation/components/admin/AdminIcons";
import { AdminPagination } from "@/presentation/components/admin/AdminPagination";
import { AdminSearch } from "@/presentation/components/admin/AdminSearch";
import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableRow,
} from "@/presentation/components/admin/AdminTable";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";
import type { ProductRow } from "@/domain/types/products";

type SortKey = "productId" | "category" | "tags" | "isActive" | "updatedAt" | "";

const DEFAULT_PAGE_SIZE = 50;

type AdminProductsContentProps = {
  initialProducts: ProductRow[];
  initialNextCursor: string | null;
  totalProducts: number;
  error?: string | null;
};

function IconSort({ dir }: { dir: "asc" | "desc" | null }) {
  const iconName = dir === "asc" ? "sortAsc" : dir === "desc" ? "sortDesc" : "sortNone";
  return (
    <AdminIcon name={iconName} className="ml-1 inline-flex w-3 justify-center text-[11px] text-zinc-500" />
  );
}

function compareProducts(a: ProductRow, b: ProductRow, key: SortKey, dir: "asc" | "desc"): number {
  if (!key) return 0;
  let cmp = 0;
  switch (key) {
    case "productId":
      cmp = (a.productId ?? "").localeCompare(b.productId ?? "");
      break;
    case "category":
      cmp = (a.category ?? "").localeCompare(b.category ?? "");
      break;
    case "tags":
      cmp = (Array.isArray(a.tags) ? a.tags.join(",") : "").localeCompare(
        Array.isArray(b.tags) ? b.tags.join(",") : ""
      );
      break;
    case "isActive":
      cmp = (a.isActive ? 1 : 0) - (b.isActive ? 1 : 0);
      break;
    case "updatedAt": {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      cmp = ta - tb;
      break;
    }
    default:
      return 0;
  }
  return dir === "asc" ? cmp : -cmp;
}

function buildProductsUrl(params: {
  pageSize: number;
  cursor?: string | null;
  query?: string;
}): string {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.pageSize));
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.query?.trim()) searchParams.set("q", params.query.trim());
  return `/api/admin/products?${searchParams.toString()}`;
}

export function AdminProductsContent({
  initialProducts,
  initialNextCursor,
  totalProducts,
  error,
}: AdminProductsContentProps) {
  const router = useRouter();
  const authFetch = useAuthenticatedFetch();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [productsByPage, setProductsByPage] = useState<Record<number, ProductRow[]>>({
    1: initialProducts,
  });
  const [nextCursorByPage, setNextCursorByPage] = useState<Record<number, string | null>>({
    1: initialNextCursor,
  });
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isSearching = searchQuery.trim().length > 0;

  const pageProducts = productsByPage[page] ?? [];

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return pageProducts;
    return [...pageProducts].sort((a, b) => compareProducts(a, b, sortKey, sortDir));
  }, [pageProducts, sortKey, sortDir]);

  const hasMore = nextCursorByPage[page] != null;
  const loadedCount = Object.values(productsByPage).reduce(
    (count, products) => count + products.length,
    0
  );
  const paginationTotal = isSearching
    ? loadedCount + (hasMore ? pageSize : 0)
    : totalProducts;

  const openProduct = useCallback(
    (productId: string) => {
      router.push(`/admin/products/${encodeURIComponent(productId)}`);
    },
    [router]
  );

  const fetchProductsPage = useCallback(
    async (params: {
      targetPage: number;
      targetPageSize: number;
      query: string;
      cursor: string | null;
    }) => {
      setLoadError(null);
      setLoadingPage(true);
      try {
        const res = await authFetch(
          buildProductsUrl({
            pageSize: params.targetPageSize,
            cursor: params.cursor,
            query: params.query,
          })
        );
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          const message = Array.isArray(data)
            ? "Failed to load products"
            : (data as { error?: string }).error ?? "Failed to load products";
          throw new Error(message);
        }
        const nextCursor = res.headers.get("X-Next-Cursor");
        setProductsByPage((current) =>
          params.targetPage === 1
            ? { 1: data }
            : { ...current, [params.targetPage]: data }
        );
        setNextCursorByPage((current) =>
          params.targetPage === 1
            ? { 1: nextCursor }
            : { ...current, [params.targetPage]: nextCursor }
        );
        setPage(params.targetPage);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setLoadingPage(false);
      }
    },
    [authFetch]
  );

  const loadPage = useCallback(
    async (targetPage: number) => {
      if (productsByPage[targetPage]) {
        setPage(targetPage);
        return;
      }

      const previousPage = targetPage - 1;
      const cursor = nextCursorByPage[previousPage];
      if (!cursor) return;

      await fetchProductsPage({
        targetPage,
        targetPageSize: pageSize,
        query: searchQuery,
        cursor,
      });
    },
    [fetchProductsPage, nextCursorByPage, pageSize, productsByPage, searchQuery]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!searchQuery.trim() && pageSize === DEFAULT_PAGE_SIZE) {
        setProductsByPage({ 1: initialProducts });
        setNextCursorByPage({ 1: initialNextCursor });
        setPage(1);
        setLoadError(null);
        setLoadingPage(false);
        return;
      }

      void fetchProductsPage({
        targetPage: 1,
        targetPageSize: pageSize,
        query: searchQuery,
        cursor: null,
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    fetchProductsPage,
    initialNextCursor,
    initialProducts,
    pageSize,
    searchQuery,
  ]);

  const toggleSort = useCallback((key: SortKey) => {
    if (!key) return;
    setPage(1);
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(key === "updatedAt" ? "desc" : "asc");
      return key;
    });
  }, []);

  const sortableHeader = (key: SortKey, label: string) => (
    <AdminTableHeaderCell
      className="cursor-pointer select-none hover:text-zinc-900"
      aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex items-center font-semibold"
      >
        {label}
        <IconSort dir={sortKey === key ? sortDir : null} />
      </button>
    </AdminTableHeaderCell>
  );

  return (
    <AdminCard title="Products" description="Search, sort, and edit products in Firestore.">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <>
          <div className="pb-4">
            <AdminSearch
              label="Search / filter"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
                setProductsByPage({});
                setNextCursorByPage({});
                setLoadError(null);
                setLoadingPage(true);
              }}
              placeholder="Search by product ID prefix..."
            />
          </div>
          {loadError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </div>
          )}
          {loadingPage && pageProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading...</p>
          ) : sortedFiltered.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {!isSearching && totalProducts === 0
                ? "No products available."
                : "No products match your search."}
            </p>
          ) : (
            <>
              <AdminTable className="max-h-[65vh] overflow-y-auto">
                <thead className="sticky top-0 z-10 bg-zinc-50 shadow-sm">
                  <AdminTableHeaderRow>
                    {sortableHeader("productId", "Product ID")}
                    {sortableHeader("category", "Category")}
                    {sortableHeader("tags", "Tags")}
                    {sortableHeader("isActive", "Active")}
                    {sortableHeader("updatedAt", "Updated")}
                    <AdminTableHeaderCell>Actions</AdminTableHeaderCell>
                  </AdminTableHeaderRow>
                </thead>
                <AdminTableBody>
                  {sortedFiltered.map((product) => (
                    <AdminTableRow
                      key={product.productId}
                      interactive
                      onClick={() => openProduct(product.productId)}
                    >
                      <AdminTableCell className="font-mono text-zinc-900">
                        {product.productId}
                      </AdminTableCell>
                      <AdminTableCell className="text-zinc-700">
                        {product.category || "-"}
                      </AdminTableCell>
                      <AdminTableCell className="max-w-[220px] truncate text-zinc-700">
                        {Array.isArray(product.tags) ? product.tags.join(", ") || "-" : "-"}
                      </AdminTableCell>
                      <AdminTableCell>
                        <AdminBadge variant={product.isActive ? "success" : "default"}>
                          {product.isActive ? "Active" : "Inactive"}
                        </AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell className="text-xs text-zinc-500">
                        {product.updatedAt ? new Date(product.updatedAt).toLocaleString() : "-"}
                      </AdminTableCell>
                      <AdminTableCell>
                        <div
                          className="flex flex-wrap items-center gap-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Link href={`/admin/products/${encodeURIComponent(product.productId)}`}>
                            <AdminButton variant="secondary" size="sm" className="inline-flex items-center gap-1.5">
                              <AdminIcon name="edit" className="h-4 w-4 shrink-0" />
                              Open
                            </AdminButton>
                          </Link>
                        </div>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
              <div className="mt-3 flex items-center justify-between gap-3">
                <AdminPagination
                  page={page}
                  pageSize={pageSize}
                  total={paginationTotal}
                  hasMore={hasMore}
                  totalIsEstimate={isSearching}
                  onPageChange={(newPage) => {
                    void loadPage(newPage);
                  }}
                  pageSizeOptions={[10, 25, 50]}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                    setProductsByPage({});
                    setNextCursorByPage({});
                    setLoadError(null);
                    setLoadingPage(true);
                  }}
                />
              </div>
            </>
          )}
        </>
      )}
    </AdminCard>
  );
}
