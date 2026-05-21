import * as productsRepo from "@/infrastructure/repositories/products.repository";
import * as tagsRepo from "@/infrastructure/repositories/tags.repository";
import * as ratesRepo from "@/infrastructure/repositories/rates.repository";
import { getGoldRate } from "../rates/getGoldRate";

export type DashboardStats = {
  totalProducts: number;
  totalTags: number;
  totalRates: number;
  goldRate: number | null;
  goldRateUpdatedAt: string | null;
  lastProductUpdate: string | null;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalProducts, totalTags, totalRates, goldRateDoc, lastProductUpdate] =
    await Promise.all([
      productsRepo.countProducts(),
      tagsRepo.countTags(),
      ratesRepo.countRates(),
      getGoldRate(),
      productsRepo.getLatestProductUpdatedAt(),
    ]);

  return {
    totalProducts,
    totalTags,
    totalRates,
    goldRate: goldRateDoc.rate,
    goldRateUpdatedAt: goldRateDoc.updatedAt,
    lastProductUpdate,
  };
}
