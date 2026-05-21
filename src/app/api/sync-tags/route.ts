import { NextResponse } from "next/server";
import { syncTagsFromDrive, syncTagsFromDriveLink } from "@/application/use-cases/tags/syncTagsFromDrive";
import { DRIVE_FOLDER_ID } from "@/config";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

export async function POST(request: Request) {
  const auth = await requireAdminPermission(request, "imports.run");
  if (!auth.ok) return auth.response;

  try {
    let body: { driveFolderId?: string; driveLink?: string } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      // no body or invalid JSON – use default folder
    }
    let folderId: string | null = null;
    if (body.driveLink && typeof body.driveLink === "string" && body.driveLink.trim()) {
      const result = await syncTagsFromDriveLink(body.driveLink.trim());
      return NextResponse.json(result);
    }
    if (
      body.driveFolderId &&
      typeof body.driveFolderId === "string"
    ) {
      folderId = body.driveFolderId.trim() || null;
    }
    if (folderId === null || folderId === "") {
      folderId = DRIVE_FOLDER_ID?.trim() || null;
    }
    if (!folderId) {
      return NextResponse.json(
        {
          error:
            "DRIVE_FOLDER_ID must be set or provide a Google Drive folder link.",
        },
        { status: 400 }
      );
    }
    const result = await syncTagsFromDrive(folderId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Sync tags error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
