import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { COLLECTION_ADMIN_USERS } from "@/shared/constants/auth";
import {
  hasPermission,
  normalizePermissions,
  type AdminUserProfile,
  type Permission,
  type Role,
} from "@/domain/auth/permissions";

export type AuthResult =
  | { ok: true; profile: AdminUserProfile }
  | { ok: false; response: NextResponse };

function readRole(value: unknown): Role {
  return value === "Admin" || value === "Staff" || value === "Viewer" ? value : "Viewer";
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function bootstrapEmails(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdminPermission(
  request: Request,
  permission: Permission
): Promise<AuthResult> {
  const token = getBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  try {
    const firebase = getFirebaseAdmin();
    const decoded = await firebase.auth().verifyIdToken(token);
    const userDoc = await firebase.firestore().collection(COLLECTION_ADMIN_USERS).doc(decoded.uid).get();
    const email = decoded.email ?? null;
    const bootstrap = email ? bootstrapEmails().includes(email.toLowerCase()) : false;

    if (!userDoc.exists && !bootstrap) {
      return {
        ok: false,
        response: NextResponse.json({ error: "No admin profile assigned" }, { status: 403 }),
      };
    }

    const data = userDoc.exists ? userDoc.data() ?? {} : {};
    const profile: AdminUserProfile = {
      uid: decoded.uid,
      email: typeof data.email === "string" ? data.email : email,
      displayName: typeof data.displayName === "string" ? data.displayName : decoded.name ?? null,
      role: bootstrap ? "Admin" : readRole(data.role),
      permissions: bootstrap ? [] : normalizePermissions(data.permissions),
      disabled: data.disabled === true,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };

    if (!hasPermission(profile, permission)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Permission denied" }, { status: 403 }),
      };
    }

    return { ok: true, profile };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid authentication token";
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: 401 }),
    };
  }
}

