import * as adminLogsRepo from "@/infrastructure/repositories/admin-logs.repository";

export type LogAdminActionParams = {
  adminId: string;
  action: string;
  collection: string;
  documentId?: string | null;
  updatedField?: string | null;
};

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  try {
    await adminLogsRepo.createAdminLog(params);
  } catch {
    // Swallow errors so logging never fails the request
  }
}
