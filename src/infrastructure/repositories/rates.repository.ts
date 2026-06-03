import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { COLLECTION_RATE } from "@/shared/constants/firestore";
import { serializeTimestamp } from "@/shared/utils/serialize-timestamp";

type RateDoc = {
  rateId: string;
  TYP: string;
  SHP: string;
  Band: string;
  // Rs_Rate is normally an encrypted base64 string, but legacy rows may
  // contain a plain number. Keep the raw shape so the decrypt layer can
  // handle both.
  Rs_Rate: string | number | null;
  updatedAt: string | null;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

export type ListRatesPaginatedResult = {
  items: RateDoc[];
  nextCursor: string | null;
};

function docToRateDoc(
  d: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): RateDoc {
  const data = d.data() ?? {};
  return {
    rateId: d.id,
    TYP: data.TYP ?? "",
    SHP: data.SHP ?? "",
    Band: data.Band ?? "",
    Rs_Rate: (data.Rs_Rate as string | number | null | undefined) ?? null,
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function listRates(): Promise<RateDoc[]> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION_RATE).get();
  return snapshot.docs.map((d) => docToRateDoc(d));
}

export async function listRatesPaginated(options: {
  limit?: number;
  cursor?: string | null;
} = {}): Promise<ListRatesPaginatedResult> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
    .collection(COLLECTION_RATE)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(limit + 1);

  if (options.cursor?.trim()) {
    query = query.startAfter(options.cursor.trim());
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  return {
    items: docs.map((d) => docToRateDoc(d)),
    nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : null,
  };
}

export async function countRates(): Promise<number> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION_RATE).count().get();
  return snapshot.data().count;
}

export async function getRate(rateId: string): Promise<RateDoc | null> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db.collection(COLLECTION_RATE).doc(rateId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return docToRateDoc(snap);
}

export async function updateRate(
  rateId: string,
  update: {
    Rs_Rate?: string | null;
    TYP?: string;
    SHP?: string;
    Band?: string;
  }
): Promise<boolean> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db.collection(COLLECTION_RATE).doc(rateId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const payload: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminEditedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (update.Rs_Rate !== undefined) payload.Rs_Rate = update.Rs_Rate;
  if (update.TYP !== undefined) payload.TYP = update.TYP;
  if (update.SHP !== undefined) payload.SHP = update.SHP;
  if (update.Band !== undefined) payload.Band = update.Band;
  await ref.update(payload);
  return true;
}

const FIRESTORE_BATCH_SIZE = 500;

export async function deleteAllRates(): Promise<number> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const coll = db.collection(COLLECTION_RATE);
  let deleted = 0;
  let snapshot = await coll.limit(FIRESTORE_BATCH_SIZE).get();
  while (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleted += 1;
    });
    await batch.commit();
    snapshot = await coll.limit(FIRESTORE_BATCH_SIZE).get();
  }
  return deleted;
}

type RateWriteDoc = {
  TYP: string;
  SHP: string;
  Band: string;
  Rs_Rate: string | null;
};

type RateWriteDocWithId = RateWriteDoc & {
  rateId: string;
};

export async function createRates(docs: RateWriteDoc[]): Promise<number> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const coll = db.collection(COLLECTION_RATE);
  let written = 0;
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_SIZE) {
    const chunk = docs.slice(i, i + FIRESTORE_BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      const ref = coll.doc();
      batch.set(ref, doc);
      written += 1;
    }
    await batch.commit();
  }
  return written;
}

export async function createRatesWithIds(
  docs: RateWriteDocWithId[]
): Promise<number> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const coll = db.collection(COLLECTION_RATE);
  let written = 0;
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_SIZE) {
    const chunk = docs.slice(i, i + FIRESTORE_BATCH_SIZE);
    const batch = db.batch();
    for (const { rateId, ...doc } of chunk) {
      batch.set(coll.doc(rateId), doc);
      written += 1;
    }
    await batch.commit();
  }
  return written;
}
