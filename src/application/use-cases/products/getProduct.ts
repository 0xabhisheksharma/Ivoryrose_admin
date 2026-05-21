import * as productsRepo from "@/infrastructure/repositories/products.repository";

export async function getProduct(productId: string) {
  const product = await productsRepo.getProduct(productId);
  if (!product) return null;
  const rowsData = await productsRepo.getProductRows(productId);
  return {
    ...product,
    rows: rowsData?.rows ?? null,
    rowsUpdatedAt: rowsData?.updatedAt ?? null,
  };
}
