export type RateRow = {
  rateId: string;
  TYP: string;
  SHP: string;
  Band: string;
  Rs_Rate: number | null;
  updatedAt: string | null;
};

export type RateSyncResult = {
  deleted: number;
  written: number;
  total: number;
  skipped: number;
};
