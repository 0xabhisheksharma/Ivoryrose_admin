import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { updateTag } from "@/application/use-cases/tags/updateTag";
import { deleteTag } from "@/application/use-cases/tags/deleteTag";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

type RouteContext = { params: Promise<{ tagId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminPermission(request, "tags.write");
  if (!auth.ok) return auth.response;

  try {
    const { tagId } = await context.params;
    if (!tagId) {
      return NextResponse.json({ error: "tagId required" }, { status: 400 });
    }
    const body = (await request.json()) as { name?: string; type?: string };
    const ok = await updateTag(tagId, { name: body.name, type: body.type });
    if (!ok) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    const updatedFields: string[] = [];
    if (body.name !== undefined) updatedFields.push("name");
    if (body.type !== undefined) updatedFields.push("type");
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "tag_updated",
      collection: "tags",
      documentId: tagId,
      updatedField:
        updatedFields.length > 0 ? updatedFields.join(",") : null,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin tag patch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAdminPermission(request, "tags.write");
  if (!auth.ok) return auth.response;

  try {
    const { tagId } = await context.params;
    if (!tagId) {
      return NextResponse.json({ error: "tagId required" }, { status: 400 });
    }
    const ok = await deleteTag(tagId);
    if (!ok) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "tag_deleted",
      collection: "tags",
      documentId: tagId,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin tag delete error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
