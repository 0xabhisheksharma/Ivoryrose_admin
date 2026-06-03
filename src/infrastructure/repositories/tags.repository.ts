import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { COLLECTION_TAGS } from "@/shared/constants/firestore";
import { serializeTimestamp } from "@/shared/utils/serialize-timestamp";
import type { TagRow } from "@/domain/types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export type ListTagsPaginatedResult = {
  items: TagRow[];
  nextCursor: string | null;
};

function docToTagRow(
  d: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): TagRow {
  const data = d.data() ?? {};
  return {
    tagId: d.id,
    name: data.name ?? "",
    type: data.type ?? "",
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function listTags(): Promise<TagRow[]> {
  // Intentional full-list read: tags are a small, admin-managed taxonomy and
  // the current tags UI edits/searches the complete set without changing the
  // /api/admin/tags array response contract.
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION_TAGS).get();
  return snapshot.docs.map((d) => docToTagRow(d));
}

export async function listTagsPaginated(options: {
  limit?: number;
  cursor?: string | null;
} = {}): Promise<ListTagsPaginatedResult> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
    .collection(COLLECTION_TAGS)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(limit + 1);

  if (options.cursor?.trim()) {
    query = query.startAfter(options.cursor.trim());
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  return {
    items: docs.map((d) => docToTagRow(d)),
    nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : null,
  };
}

export async function countTags(): Promise<number> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION_TAGS).count().get();
  return snapshot.data().count;
}

export async function createTag(params: {
  name: string;
  type: string;
  tagId?: string;
}): Promise<string> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const coll = db.collection(COLLECTION_TAGS);
  const id = params.tagId?.trim() ?? coll.doc().id;
  const ref = coll.doc(id);
  await ref.set({
    name: params.name,
    type: params.type,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return id;
}

export async function updateTag(
  tagId: string,
  update: { name?: string; type?: string }
): Promise<boolean> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db.collection(COLLECTION_TAGS).doc(tagId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const payload: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminEditedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (update.name !== undefined) payload.name = update.name;
  if (update.type !== undefined) payload.type = update.type;
  await ref.update(payload);
  return true;
}

export async function deleteTag(tagId: string): Promise<boolean> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db.collection(COLLECTION_TAGS).doc(tagId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}
