import * as productsRepo from "@/infrastructure/repositories/products.repository";
import * as ratesRepo from "@/infrastructure/repositories/rates.repository";
import { getGoldRate } from "../rates/getGoldRate";

export type DashboardStats = {
  totalProducts: number;
  totalRates: number;
  goldRate: number | null;
  goldRateUpdatedAt: string | null;
  lastProductUpdate: string | null;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalProducts, totalRates, goldRateDoc, lastProductUpdate] =
    await Promise.all([
      productsRepo.countProducts(),
      ratesRepo.countRates(),
      getGoldRate(),
      productsRepo.getLatestProductUpdatedAt(),
    ]);

  return {
    totalProducts,
    totalRates,
    goldRate: goldRateDoc.rate,
    goldRateUpdatedAt: goldRateDoc.updatedAt,
    lastProductUpdate,
  };
}
