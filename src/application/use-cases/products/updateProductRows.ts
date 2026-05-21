import * as productsRepo from "@/infrastructure/repositories/products.repository";

export async function updateProductRows(
  productId: string,
  rows: unknown[]
): Promise<"updated" | "error"> {
  if (!productId) return "error";
  try {
    await productsRepo.setProductRows(productId, productId, rows);
    return "updated";
  } catch {
    return "error";
  }
}
