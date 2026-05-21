export function getAdminIdFromRequest(request: Request): string {
  const id = request.headers.get("X-Admin-Id")?.trim();
  return id || "unknown";
}
