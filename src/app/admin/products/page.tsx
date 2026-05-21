import { getProducts } from "@/application/queries/get-products";
import { AdminProductsContent } from "@/presentation/components/admin/AdminProductsContent";

export default async function AdminProductsPage() {
  let products: Awaited<ReturnType<typeof getProducts>> = [];
  let error: string | null = null;

  try {
    products = await getProducts();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load products.";
  }

  return <AdminProductsContent initialProducts={products} error={error} />;
}
