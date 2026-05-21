export type SyncResult = {
  total: number;
  updated: number;
  skipped: number;
  not_found: number;
  errors: number;
  errors_list: { productId: string; error: string }[];
};
