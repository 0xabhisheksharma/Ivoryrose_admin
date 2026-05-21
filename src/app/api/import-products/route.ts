import { NextResponse } from "next/server";
import { getAdminIdFromRequest } from "@/shared/auth/admin-id";
import { logAdminAction } from "@/application/use-cases/admin-logs/logAdminAction";
import { runProductImport } from "@/application/use-cases/products/runProductImport";
import { parseDriveFolderId } from "@/shared/utils/drive";
import { DEFAULT_PRODUCTS_DRIVE_FOLDER_ID } from "@/config";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

export async function POST(request: Request) {
  const auth = await requireAdminPermission(request, "imports.run");
  if (!auth.ok) return auth.response;

  try {
    let body: { driveLink?: string } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      // no body
    }
    const driveLink =
      body.driveLink && typeof body.driveLink === "string"
        ? body.driveLink.trim()
        : "";
    let folderId: string | null = null;
    if (driveLink) {
      folderId = parseDriveFolderId(driveLink);
      if (!folderId) {
        return NextResponse.json(
          {
            error:
              "Please paste a valid Google Drive folder link or folder ID.",
          },
          { status: 400 }
        );
      }
    }
    if (!folderId) {
      folderId = DEFAULT_PRODUCTS_DRIVE_FOLDER_ID?.trim() || null;
    }
    if (!folderId) {
      return NextResponse.json(
        {
          error:
            "Please provide a Google Drive folder link or set DRIVE_FOLDER_ID.",
        },
        { status: 400 }
      );
    }
    console.log("[import-products] API POST", { folderId });
    const result = await runProductImport({ folderId });
    logAdminAction({
      adminId: getAdminIdFromRequest(request),
      action: "import_triggered",
      collection: "products",
    }).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Import products error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
