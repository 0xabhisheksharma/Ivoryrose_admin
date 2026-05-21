import * as goldRateRepo from "@/infrastructure/repositories/gold-rate.repository";

export async function setGoldRate(rate: number) {
  await goldRateRepo.setGoldRate(rate);
}
