import { unstable_cache } from "next/cache";
import { listProducts } from "@/application/use-cases/products/listProducts";
import type { ProductRow } from "@/domain/types/products";

async function fetchProducts(): Promise<ProductRow[]> {
  try {
    return await listProducts();
  } catch (err) {
    console.error("getProducts error:", err);
    throw err;
  }
}

/**
 * Fetches all products from Firestore "products" collection.
 * Cached for 60 seconds to avoid refetch on every request.
 */
export async function getProducts(): Promise<ProductRow[]> {
  return unstable_cache(fetchProducts, ["admin-products"], { revalidate: 60 })();
}
