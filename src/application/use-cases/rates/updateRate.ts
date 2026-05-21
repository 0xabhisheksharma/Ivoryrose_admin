import * as ratesRepo from "@/infrastructure/repositories/rates.repository";
import { encryptRsRate } from "@/infrastructure/services/encryption/rate-encryption";

export async function updateRate(
  rateId: string,
  body: { rate?: number; TYP?: string; SHP?: string; Band?: string }
): Promise<boolean> {
  const update: {
    Rs_Rate?: string | null;
    TYP?: string;
    SHP?: string;
    Band?: string;
  } = {};
  if (body.rate !== undefined) {
    const encrypted = encryptRsRate(
      typeof body.rate === "number" ? body.rate : null
    );
    update.Rs_Rate = encrypted;
  }
  if (body.TYP !== undefined) update.TYP = body.TYP;
  if (body.SHP !== undefined) update.SHP = body.SHP;
  if (body.Band !== undefined) update.Band = body.Band;
  return ratesRepo.updateRate(rateId, update);
}
