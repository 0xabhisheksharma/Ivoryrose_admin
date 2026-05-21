import { NextResponse } from "next/server";
import { listRates } from "@/application/use-cases/rates/listRates";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

export async function GET(request: Request) {
  const auth = await requireAdminPermission(request, "rates.read");
  if (!auth.ok) return auth.response;

  try {
    const rates = await listRates();
    return NextResponse.json(rates);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin rates list error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
