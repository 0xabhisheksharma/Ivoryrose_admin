import { NextResponse } from "next/server";
import { getDashboardStats } from "@/application/use-cases/dashboard/getDashboardStats";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";

export async function GET(request: Request) {
  const auth = await requireAdminPermission(request, "dashboard.read");
  if (!auth.ok) return auth.response;

  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin dashboard stats error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
