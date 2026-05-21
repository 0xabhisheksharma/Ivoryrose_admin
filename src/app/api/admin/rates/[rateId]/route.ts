import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { updateRate } from "@/application/use-cases/rates/updateRate";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

type RouteContext = { params: Promise<{ rateId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminPermission(request, "rates.write");
  if (!auth.ok) return auth.response;

  try {
    const { rateId } = await context.params;
    if (!rateId) {
      return NextResponse.json({ error: "rateId required" }, { status: 400 });
    }
    const body = (await request.json()) as {
      rate?: number;
      TYP?: string;
      SHP?: string;
      Band?: string;
    };
    const ok = await updateRate(rateId, body);
    if (!ok) {
      return NextResponse.json({ error: "Rate not found" }, { status: 404 });
    }
    const updatedField =
      Object.keys(body).length > 0 ? Object.keys(body).join(",") : null;
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "rate_updated",
      collection: "Rate",
      documentId: rateId,
      updatedField,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin rate patch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
