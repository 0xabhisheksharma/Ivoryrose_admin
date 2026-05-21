import { NextResponse } from "next/server";
import { syncRatesFromSheet } from "@/application/use-cases/rates/syncRatesFromSheet";
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
    if (!driveLink) {
      return NextResponse.json(
        {
          error:
            "Please provide a Google Drive link (spreadsheet or folder containing a spreadsheet).",
        },
        { status: 400 }
      );
    }
    const result = await syncRatesFromSheet(driveLink);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Sync rate error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
