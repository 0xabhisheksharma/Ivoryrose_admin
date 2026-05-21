import * as productsRepo from "@/infrastructure/repositories/products.repository";

export async function updateProduct(
  productId: string,
  body: Record<string, unknown>
) {
  const update: Record<string, unknown> = {
    updatedAt: null,
    adminEditedAt: null,
  };
  if (body.category !== undefined) update.category = body.category;
  if (body.tags !== undefined) update.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.materials !== undefined)
    update.materials = Array.isArray(body.materials) ? body.materials : [];
  if (body.isActive !== undefined) update.isActive = Boolean(body.isActive);
  if (body.stoneSummary !== undefined) update.stoneSummary = body.stoneSummary;
  if (body.assumingNetWt !== undefined) update.assumingNetWt = body.assumingNetWt;
  if (body.images !== undefined)
    update.imageUrls = Array.isArray(body.images) ? body.images : body.images;
  delete update.updatedAt;
  delete update.adminEditedAt;
  const ok = await productsRepo.updateProduct(productId, update);
  return ok;
}
