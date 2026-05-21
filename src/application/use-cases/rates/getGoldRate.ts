import * as goldRateRepo from "@/infrastructure/repositories/gold-rate.repository";

export async function getGoldRate() {
  return goldRateRepo.getGoldRate();
}
