import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { runImport } from "@/application/use-cases/products/runImport";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";
import { parseDriveFolderId } from "@/shared/utils/drive";

export async function POST(request: Request) {
  const auth = await requireAdminPermission(request, "imports.run");
  if (!auth.ok) return auth.response;

  try {
    let body: { localFolderPath?: string; driveDestinationFolderLink?: string } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      // no body
    }

    const localFolderPath =
      body.localFolderPath && typeof body.localFolderPath === "string"
        ? body.localFolderPath.trim()
        : "";
    const driveDestinationFolderLink =
      body.driveDestinationFolderLink && typeof body.driveDestinationFolderLink === "string"
        ? body.driveDestinationFolderLink.trim()
        : "";
    const driveDestinationFolderId = driveDestinationFolderLink
      ? parseDriveFolderId(driveDestinationFolderLink) ?? undefined
      : undefined;

    if (!localFolderPath) {
      return NextResponse.json(
        { error: "Please enter a local folder path." },
        { status: 400 }
      );
    }
    if (!driveDestinationFolderId) {
      return NextResponse.json(
        { error: "Please paste a valid Google Workspace Shared Drive destination folder link or folder ID." },
        { status: 400 }
      );
    }

    console.log("[import] API POST", { localFolderPath, driveDestinationFolderId });
    const result = await runImport({ localFolderPath, driveDestinationFolderId });
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "import_triggered",
      collection: "products",
    }).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Import error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
