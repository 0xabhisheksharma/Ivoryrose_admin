import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { listTags } from "@/application/use-cases/tags/listTags";
import { createTag } from "@/application/use-cases/tags/createTag";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

export async function GET(request: Request) {
  const auth = await requireAdminPermission(request, "tags.read");
  if (!auth.ok) return auth.response;

  try {
    const tags = await listTags();
    return NextResponse.json(tags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin tags list error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission(request, "tags.write");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      tagId?: string;
      name?: string;
      type?: string;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const type = typeof body.type === "string" ? body.type.trim() : "";
    const tagId =
      typeof body.tagId === "string" && body.tagId.trim()
        ? body.tagId.trim()
        : undefined;
    const id = await createTag({ name, type, tagId });
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "tag_created",
      collection: "tags",
      documentId: id,
    }).catch(() => {});
    return NextResponse.json({ ok: true, tagId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin tag create error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
