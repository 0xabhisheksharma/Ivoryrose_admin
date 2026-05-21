import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { getGoldRate } from "@/application/use-cases/rates/getGoldRate";
import { setGoldRate } from "@/application/use-cases/rates/setGoldRate";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

export async function GET(request: Request) {
  const auth = await requireAdminPermission(request, "goldRate.read");
  if (!auth.ok) return auth.response;

  try {
    const result = await getGoldRate();
    return NextResponse.json({
      rate: result.rate,
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin gold rate get error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminPermission(request, "goldRate.write");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { rate?: number };
    const rate = body.rate;
    if (
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      return NextResponse.json(
        { error: "Valid rate number required" },
        { status: 400 }
      );
    }
    await setGoldRate(rate);
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "gold_rate_updated",
      collection: "GoldRate",
      documentId: "currentRate",
      updatedField: "rate",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin gold rate patch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
