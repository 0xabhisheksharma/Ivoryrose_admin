import { NextResponse } from "next/server";
import { listProductsPaginated } from "@/application/use-cases/products/listProducts";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

export async function GET(request: Request) {
  const auth = await requireAdminPermission(request, "products.read");
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20)) : 20;
    const cursor = searchParams.get("cursor") ?? undefined;
    const query = searchParams.get("q")?.trim() || null;
    const { items, nextCursor } = await listProductsPaginated({
      limit,
      cursor: cursor || null,
      query,
    });
    const response = NextResponse.json(items);
    if (nextCursor != null) {
      response.headers.set("X-Next-Cursor", nextCursor);
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin products list error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
