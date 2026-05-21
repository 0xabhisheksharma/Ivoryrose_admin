import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { updateProductRows } from "@/application/use-cases/products/updateProductRows";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

type RouteContext = { params: Promise<{ productId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminPermission(request, "products.write");
  if (!auth.ok) return auth.response;

  try {
    const { productId } = await context.params;
    if (!productId) {
      return NextResponse.json({ error: "productId required" }, { status: 400 });
    }
    const body = (await request.json()) as { rows?: unknown[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const result = await updateProductRows(productId, rows);
    if (result === "error") {
      return NextResponse.json(
        { error: "Failed to update rows" },
        { status: 500 }
      );
    }
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "rows_updated",
      collection: "products",
      documentId: productId,
      updatedField: "rows",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin product rows patch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
