import {
  countProducts,
  listProductsPaginated,
} from "@/application/use-cases/products/listProducts";
import { AdminProductsContent } from "@/presentation/components/admin/AdminProductsContent";
import type { ProductRow } from "@/domain/types/products";

const INITIAL_PAGE_SIZE = 50;

export default async function AdminProductsPage() {
  let products: ProductRow[] = [];
  let nextCursor: string | null = null;
  let totalProducts = 0;
  let error: string | null = null;

  try {
    const [productsPage, total] = await Promise.all([
      listProductsPaginated({ limit: INITIAL_PAGE_SIZE }),
      countProducts(),
    ]);
    products = productsPage.items;
    nextCursor = productsPage.nextCursor;
    totalProducts = total;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load products.";
  }

  return (
    <AdminProductsContent
      initialProducts={products}
      initialNextCursor={nextCursor}
      totalProducts={totalProducts}
      error={error}
    />
  );
}
