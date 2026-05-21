import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { getProduct } from "@/application/use-cases/products/getProduct";
import { updateProduct } from "@/application/use-cases/products/updateProduct";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

type RouteContext = { params: Promise<{ productId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminPermission(request, "products.read");
  if (!auth.ok) return auth.response;

  try {
    const { productId } = await context.params;
    if (!productId) {
      return NextResponse.json({ error: "productId required" }, { status: 400 });
    }
    const data = await getProduct(productId);
    if (!data) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin product get error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminPermission(request, "products.write");
  if (!auth.ok) return auth.response;

  try {
    const { productId } = await context.params;
    if (!productId) {
      return NextResponse.json({ error: "productId required" }, { status: 400 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const ok = await updateProduct(productId, body);
    if (!ok) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const updatedField =
      Object.keys(body).length > 0 ? Object.keys(body).join(",") : null;
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "product_updated",
      collection: "products",
      documentId: productId,
      updatedField,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin product patch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
