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
