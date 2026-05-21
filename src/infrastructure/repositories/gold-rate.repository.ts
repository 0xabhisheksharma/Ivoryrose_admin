import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { GOLD_RATE_DOC_PATH } from "@/shared/constants/firestore";
import { serializeTimestamp } from "@/shared/utils/serialize-timestamp";

type GoldRateDoc = {
  rate: number | null;
  updatedAt: string | null;
};

export async function getGoldRate(): Promise<GoldRateDoc> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const [coll, docId] = GOLD_RATE_DOC_PATH.split("/");
  const snap = await db.collection(coll).doc(docId).get();
  if (!snap.exists) {
    return { rate: null, updatedAt: null };
  }
  const data = snap.data() ?? {};
  const updatedAt = data.updatedAt;
  const rate = data.rate;
  const rateNum =
    typeof rate === "number"
      ? rate
      : rate != null && rate !== ""
        ? Number(rate)
        : null;
  return {
    rate: rateNum != null && Number.isFinite(rateNum) ? rateNum : null,
    updatedAt: serializeTimestamp(updatedAt),
  };
}

export async function setGoldRate(rate: number): Promise<void> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const [coll, docId] = GOLD_RATE_DOC_PATH.split("/");
  const ref = db.collection(coll).doc(docId);
  await ref.set(
    {
      rate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      adminEditedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
