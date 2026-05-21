import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { COLLECTION_PRODUCTS } from "@/shared/constants/firestore";
import { serializeTimestamp } from "@/shared/utils/serialize-timestamp";
import type { ProductRow } from "@/domain/types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type ListProductsPaginatedResult = {
  items: ProductRow[];
  nextCursor: string | null;
};

type DecodedCursor = {
  updatedAt: string | null;
  productId: string;
  query?: string | null;
};

function encodeCursor(
  updatedAt: string | null,
  productId: string,
  query?: string | null
): string {
  return Buffer.from(
    JSON.stringify({ updatedAt, productId, query }),
    "utf8"
  ).toString("base64url");
}

function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as {
      updatedAt?: string | null;
      productId?: string;
      query?: string | null;
    };
    if (typeof parsed.productId === "string") {
      const updatedAt =
        typeof parsed.updatedAt === "string" || parsed.updatedAt === null
          ? parsed.updatedAt
          : null;
      const query =
        typeof parsed.query === "string" || parsed.query === null
          ? parsed.query
          : undefined;
      return { updatedAt, productId: parsed.productId, query };
    }
  } catch {
    // invalid cursor
  }
  return null;
}

function docToProductRow(
  d: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): ProductRow {
  const data = d.data() ?? {};
  const updatedAt = data.updatedAt;
  return {
    productId: d.id,
    name: data.name ?? data.productId ?? d.id,
    category: data.category ?? "",
    tags: data.tags ?? [],
    isActive: data.isActive ?? true,
    updatedAt: serializeTimestamp(updatedAt),
  };
}

export async function listProducts(): Promise<ProductRow[]> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION_PRODUCTS).get();
  return snapshot.docs.map((d) => docToProductRow(d));
}

export async function countProducts(): Promise<number> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION_PRODUCTS).count().get();
  return snapshot.data().count;
}

export type ListProductsPaginatedOptions = {
  limit?: number;
  cursor?: string | null;
  query?: string | null;
};

export async function listProductsPaginated(
  options: ListProductsPaginatedOptions
): Promise<ListProductsPaginatedResult> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );
  const search = options.query?.trim() || "";

  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
    db.collection(COLLECTION_PRODUCTS);

  if (search) {
    // Search mode: prefix search on productId; cursor is tied to query.
    query = query
      .orderBy("productId")
      .orderBy(admin.firestore.FieldPath.documentId(), "desc")
      .startAt(search)
      .endAt(`${search}\uf8ff`)
      .limit(limit + 1);

    if (options.cursor?.trim()) {
      const decoded = decodeCursor(options.cursor.trim());
      if (decoded && (decoded.query ?? "") === search) {
        query = query.startAfter(decoded.productId, decoded.productId);
      }
    }
  } else {
    // Default mode: existing updatedAt-based pagination.
    query = query
      .orderBy("updatedAt", "desc")
      .orderBy(admin.firestore.FieldPath.documentId(), "desc")
      .limit(limit + 1);

    if (options.cursor?.trim()) {
      const decoded = decodeCursor(options.cursor.trim());
      if (decoded && typeof decoded.updatedAt === "string") {
        const cursorTimestamp = admin.firestore.Timestamp.fromDate(
          new Date(decoded.updatedAt)
        );
        query = query.startAfter(cursorTimestamp, decoded.productId);
      }
    }
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const items = docs.map((d) => docToProductRow(d));
  const hasMore = snapshot.docs.length > limit;
  const lastDoc = docs[docs.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && lastDoc) {
    if (search) {
      nextCursor = encodeCursor(null, lastDoc.id, search);
    } else {
      nextCursor = encodeCursor(
        serializeTimestamp(lastDoc.data().updatedAt),
        lastDoc.id,
        null
      );
    }
  }

  return { items, nextCursor };
}

export async function getProduct(
  productId: string
): Promise<Record<string, unknown> | null> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db.collection(COLLECTION_PRODUCTS).doc(productId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const serialized: Record<string, unknown> = { ...data, productId: snap.id };
  for (const key of Object.keys(serialized)) {
    const v = serialized[key];
    const serializedTs = serializeTimestamp(v);
    if (serializedTs !== null) serialized[key] = serializedTs;
  }
  return serialized;
}

export async function getProductRows(
  productId: string
): Promise<{ rows: unknown[]; updatedAt: string | null } | null> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db
    .collection(COLLECTION_PRODUCTS)
    .doc(productId)
    .collection("rows")
    .doc(productId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const updatedAt = serializeTimestamp(data.updatedAt);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return { rows, updatedAt };
}

export async function updateProduct(
  productId: string,
  update: Record<string, unknown>
): Promise<boolean> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db.collection(COLLECTION_PRODUCTS).doc(productId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const updatePayload: Record<string, unknown> = {
    ...update,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminEditedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.update(updatePayload);
  return true;
}

export async function updateProductTags(
  productId: string,
  tags: string[]
): Promise<"updated" | "not_found" | "error"> {
  if (!tags || !Array.isArray(tags)) return "error";
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db.collection(COLLECTION_PRODUCTS).doc(productId);
  const snap = await ref.get();
  if (!snap.exists) return "not_found";
  try {
    await ref.update({
      tags,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return "updated";
  } catch {
    return "error";
  }
}

type ProductTagsUpdateInput = {
  productId: string;
  tags: string[];
};

export type BulkProductTagsUpdateResult = {
  updated: number;
  skipped: number;
  not_found: number;
  errors: { productId: string; error: string }[];
};

const FIRESTORE_READ_CHUNK_SIZE = 300;
const FIRESTORE_WRITE_BATCH_SIZE = 450;

function tagsEqual(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((tag, index) => String(tag) === b[index]);
}

export async function updateProductTagsBulk(
  updates: ProductTagsUpdateInput[]
): Promise<BulkProductTagsUpdateResult> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const coll = db.collection(COLLECTION_PRODUCTS);
  const result: BulkProductTagsUpdateResult = {
    updated: 0,
    skipped: 0,
    not_found: 0,
    errors: [],
  };

  const latestByProductId = new Map<string, string[]>();
  for (const update of updates) {
    if (!update.productId || !Array.isArray(update.tags) || update.tags.length === 0) {
      result.skipped++;
      continue;
    }
    if (latestByProductId.has(update.productId)) {
      result.skipped++;
    }
    latestByProductId.set(update.productId, update.tags);
  }

  const productIds = Array.from(latestByProductId.keys());
  if (productIds.length === 0) return result;

  const existingDocs = new Map<
    string,
    FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
  >();

  for (let i = 0; i < productIds.length; i += FIRESTORE_READ_CHUNK_SIZE) {
    const chunk = productIds.slice(i, i + FIRESTORE_READ_CHUNK_SIZE);
    const refs = chunk.map((productId) => coll.doc(productId));
    const docs = await db.getAll(...refs);
    docs.forEach((doc) => existingDocs.set(doc.id, doc));
  }

  const writes: { productId: string; tags: string[] }[] = [];
  for (const productId of productIds) {
    const doc = existingDocs.get(productId);
    if (!doc?.exists) {
      result.not_found++;
      continue;
    }

    const tags = latestByProductId.get(productId) ?? [];
    if (tagsEqual(doc.data()?.tags, tags)) {
      result.skipped++;
      continue;
    }

    writes.push({ productId, tags });
  }

  for (let i = 0; i < writes.length; i += FIRESTORE_WRITE_BATCH_SIZE) {
    const chunk = writes.slice(i, i + FIRESTORE_WRITE_BATCH_SIZE);
    const batch = db.batch();
    for (const { productId, tags } of chunk) {
      batch.update(coll.doc(productId), {
        tags,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    try {
      await batch.commit();
      result.updated += chunk.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const { productId } of chunk) {
        result.errors.push({ productId, error: message });
      }
    }
  }

  return result;
}

export async function setProductRows(
  productId: string,
  rowsDocId: string,
  rows: unknown[]
): Promise<void> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const ref = db
    .collection(COLLECTION_PRODUCTS)
    .doc(productId)
    .collection("rows")
    .doc(rowsDocId);
  await ref.set({
    rows,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function getLatestProductUpdatedAt(): Promise<string | null> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const snapshot = await db
    .collection(COLLECTION_PRODUCTS)
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const data = snapshot.docs[0].data();
  return serializeTimestamp(data.updatedAt);
}
