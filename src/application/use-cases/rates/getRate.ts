import * as ratesRepo from "@/infrastructure/repositories/rates.repository";
import { decryptRsRate } from "@/infrastructure/services/encryption/rate-encryption";
import type { RateRow } from "@/domain/types";

export async function getRate(rateId: string): Promise<RateRow | null> {
  const doc = await ratesRepo.getRate(rateId);
  if (!doc) return null;
  return {
    rateId: doc.rateId,
    TYP: doc.TYP,
    SHP: doc.SHP,
    Band: doc.Band,
    Rs_Rate: decryptRsRate(doc.Rs_Rate),
    updatedAt: doc.updatedAt,
  };
}
