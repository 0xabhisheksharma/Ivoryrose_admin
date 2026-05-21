import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/infrastructure/firebase/admin";
import { COLLECTION_ADMIN_USERS } from "@/shared/constants/auth";
import { ROLE_PERMISSION_PRESETS } from "@/domain/auth/permissions";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function allowedBootstrapEmails(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const firebase = getFirebaseAdmin();
    const decoded = await firebase.auth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const allowedEmails = allowedBootstrapEmails();
    const existingAdminSnap = await firebase
      .firestore()
      .collection(COLLECTION_ADMIN_USERS)
      .limit(1)
      .get();
    const noAdminsExist = existingAdminSnap.empty;

    if (!email || (!noAdminsExist && !allowedEmails.includes(email))) {
      return NextResponse.json(
        {
          error:
            "This email is not allowed to create an admin profile. Ask an existing admin to add you, or add this email to ADMIN_BOOTSTRAP_EMAILS and NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAILS.",
        },
        { status: 403 }
      );
    }

    const userRef = firebase.firestore().collection(COLLECTION_ADMIN_USERS).doc(decoded.uid);
    const existing = await userRef.get();
    const now = new Date().toISOString();

    await userRef.set(
      {
        email: decoded.email ?? email,
        displayName: decoded.name ?? decoded.email ?? "Admin",
        role: "Admin",
        permissions: ROLE_PERMISSION_PRESETS.Admin,
        disabled: false,
        createdAt: existing.exists ? existing.data()?.createdAt ?? now : now,
        updatedAt: now,
        updatedBy: decoded.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to create admin profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
