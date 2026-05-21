import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { COLLECTION_TAGS } from "@/shared/constants/firestore";
import { serializeTimestamp } from "@/shared/utils/serialize-timestamp";
import type { TagRow } from "@/domain/types";

export async function listTags(): Promise<TagRow[]> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION_TAGS).get();
  return snapshot.docs.map((d) => {
    const data = d.data();
    const updatedAt = data.updatedAt;
    return {
      tagId: d.id,
      name: data.name ?? "",
      type: data.type ?? "",
      updatedAt: serializeTimestamp(updatedAt),
    };
  });
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
