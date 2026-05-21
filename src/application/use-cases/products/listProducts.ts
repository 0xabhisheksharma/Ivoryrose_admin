import * as productsRepo from "@/infrastructure/repositories/products.repository";

export async function listProducts() {
  return productsRepo.listProducts();
}

export type ListProductsPaginatedOptions = {
  limit?: number;
  cursor?: string | null;
  query?: string | null;
};

export async function listProductsPaginated(options: ListProductsPaginatedOptions) {
  return productsRepo.listProductsPaginated(options);
}
