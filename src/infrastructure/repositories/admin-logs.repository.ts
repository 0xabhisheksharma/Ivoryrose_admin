import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { COLLECTION_ADMIN_LOGS } from "@/shared/constants/firestore";

export type AdminLogEntry = {
  adminId: string;
  action: string;
  collection: string;
  documentId?: string | null;
  updatedField?: string | null;
};

export async function createAdminLog(entry: AdminLogEntry): Promise<void> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const doc: Record<string, unknown> = {
    adminId: entry.adminId,
    action: entry.action,
    collection: entry.collection,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (entry.documentId != null && entry.documentId !== "") {
    doc.documentId = entry.documentId;
  }
  if (entry.updatedField != null && entry.updatedField !== "") {
    doc.updatedField = entry.updatedField;
  }
  await db.collection(COLLECTION_ADMIN_LOGS).add(doc);
}
