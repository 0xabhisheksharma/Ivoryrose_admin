import * as ratesRepo from "@/infrastructure/repositories/rates.repository";
import { decryptRsRate } from "@/infrastructure/services/encryption/rate-encryption";
import type { RateRow } from "@/domain/types";

export async function listRates(): Promise<RateRow[]> {
  const docs = await ratesRepo.listRates();
  return docs.map((d) => ({
    rateId: d.rateId,
    TYP: d.TYP,
    SHP: d.SHP,
    Band: d.Band,
    Rs_Rate: decryptRsRate(d.Rs_Rate),
    updatedAt: d.updatedAt,
  }));
}

export async function listRatesPaginated(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: RateRow[]; nextCursor: string | null }> {
  const result = await ratesRepo.listRatesPaginated(options);
  return {
    items: result.items.map((d) => ({
      rateId: d.rateId,
      TYP: d.TYP,
      SHP: d.SHP,
      Band: d.Band,
      Rs_Rate: decryptRsRate(d.Rs_Rate),
      updatedAt: d.updatedAt,
    })),
    nextCursor: result.nextCursor,
  };
}

export async function countRates(): Promise<number> {
  return ratesRepo.countRates();
}
