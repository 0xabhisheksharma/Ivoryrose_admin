"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { COLLECTION_ADMIN_USERS } from "@/shared/constants/auth";
import { getClientAuth, getClientFirestore } from "@/infrastructure/firebase/client";
import {
  hasPermission,
  normalizePermissions,
  type AdminUserProfile,
  type Permission,
  type Role,
} from "@/domain/auth/permissions";

type AuthContextValue = {
  user: User | null;
  profile: AdminUserProfile | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  createFirstAdmin: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  can: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readRole(value: unknown): Role {
  return value === "Admin" || value === "Staff" || value === "Viewer" ? value : "Viewer";
}

function profileFromSnapshot(uid: string, data: Record<string, unknown>): AdminUserProfile {
  return {
    uid,
    email: typeof data.email === "string" ? data.email : null,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    role: readRole(data.role),
    permissions: normalizePermissions(data.permissions),
    disabled: data.disabled === true,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

function clientBootstrapEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (authUser: User | null) => {
    if (!authUser) {
      setProfile(null);
      return;
    }

    const db = getClientFirestore();
    const snap = await getDoc(doc(db, COLLECTION_ADMIN_USERS, authUser.uid));
    if (!snap.exists()) {
      const bootstrap = authUser.email
        ? clientBootstrapEmails().includes(authUser.email.toLowerCase())
        : false;
      if (bootstrap) {
        setProfile({
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          role: "Admin",
          permissions: [],
        });
        setError(null);
        return;
      }
      setProfile(null);
      setError("This Firebase account is signed in, but no admin profile has been assigned.");
      return;
    }

    const nextProfile = profileFromSnapshot(authUser.uid, snap.data());
    if (nextProfile.disabled) {
      setProfile(null);
      setError("This admin account has been disabled.");
      return;
    }

    setProfile(nextProfile);
    setError(null);
  }, []);

  useEffect(() => {
    const auth = getClientAuth();
    return onAuthStateChanged(auth, async (nextUser) => {
      setLoading(true);
      setUser(nextUser);
      setError(null);
      try {
        await loadProfile(nextUser);
      } catch (err) {
        setProfile(null);
        setError(err instanceof Error ? err.message : "Failed to load admin profile.");
      } finally {
        setLoading(false);
      }
    });
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      login: async (email, password) => {
        setError(null);
        await signInWithEmailAndPassword(getClientAuth(), email, password);
      },
      createFirstAdmin: async ({ email, password, displayName }) => {
        setError(null);
        const auth = getClientAuth();
        let credential;
        try {
          credential = await createUserWithEmailAndPassword(auth, email, password);
        } catch (err) {
          const code =
            typeof err === "object" && err !== null && "code" in err
              ? String((err as { code?: unknown }).code)
              : "";
          if (code !== "auth/email-already-in-use") {
            throw err;
          }
          credential = await signInWithEmailAndPassword(auth, email, password);
        }
        if (displayName.trim() && !credential.user.displayName) {
          await updateProfile(credential.user, { displayName: displayName.trim() });
        }
        const token = await credential.user.getIdToken();
        const response = await fetch("/api/auth/bootstrap-admin", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          await signOut(getClientAuth());
          throw new Error(data.error ?? "Unable to create admin profile.");
        }
        await loadProfile(credential.user);
      },
      sendPasswordReset: async (email) => {
        setError(null);
        await sendPasswordResetEmail(getClientAuth(), email);
      },
      logout: async () => {
        await signOut(getClientAuth());
      },
      refreshProfile: async () => {
        setLoading(true);
        try {
          await loadProfile(getClientAuth().currentUser);
        } finally {
          setLoading(false);
        }
      },
      getIdToken: async () => {
        const currentUser = getClientAuth().currentUser;
        return currentUser ? currentUser.getIdToken() : null;
      },
      can: (permission) => hasPermission(profile, permission),
    }),
    [error, loadProfile, loading, profile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
