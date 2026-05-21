"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthProvider, useAuth } from "@/presentation/auth/AuthContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading, error, login, createFirstAdmin, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const next = searchParams.get("next") || "/admin";

  useEffect(() => {
    if (!loading && user && profile) {
      router.replace(next);
    }
  }, [loading, next, profile, router, user]);

  function friendlyAuthError(err: unknown): string {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
      return "That email and password do not match a Firebase Auth account. Use First admin to create the initial admin account, or reset the password if the account already exists.";
    }
    if (code === "auth/email-already-in-use") {
      return "That email already has a Firebase Auth account. Use Sign in, or reset the password if needed.";
    }
    if (code === "auth/weak-password") {
      return "Please use a stronger password with at least 6 characters.";
    }
    if (code === "auth/operation-not-allowed") {
      return "Email/password sign-in is not enabled in Firebase Authentication. Enable it in Firebase Console > Authentication > Sign-in method.";
    }
    if (err instanceof Error) return err.message;
    return "Unable to continue.";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        await login(email.trim(), password);
      } else {
        await createFirstAdmin({
          email: email.trim(),
          password,
          displayName,
        });
      }
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Enter your email first, then request a password reset.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setNotice(null);
    try {
      await sendPasswordReset(trimmedEmail);
      setNotice("Password reset email sent. Check your inbox, then return here to sign in.");
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setFormError(null);
    setNotice(null);
  }

  return (
    <main className="grid min-h-screen bg-[#F6F7FB] lg:grid-cols-[minmax(0,1fr)_520px]">
      <section className="relative hidden overflow-hidden bg-[#111827] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(212,175,55,0.28),transparent_32%),linear-gradient(135deg,#111827_0%,#172033_52%,#0F172A_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#D4AF37]">Ivory Admin</p>
            <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight tracking-tight">
              Secure operations console for products, rates, imports, and staff access.
            </h1>
          </div>
          <div className="grid max-w-xl grid-cols-3 gap-3">
            {["Role gated", "Permission aware", "Responsive"].map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/8 p-4">
                <p className="text-sm font-medium text-white">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#96751B]">Ivory Admin</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Secure admin login</h1>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                {mode === "signin" ? "Sign in" : "Create first admin"}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {mode === "signin"
                  ? "Use your Firebase admin account to access assigned dashboard sections."
                  : "Create the initial admin account using an email approved in your bootstrap settings."}
              </p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-md bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`rounded px-3 py-2 text-sm font-semibold transition ${
                  mode === "signin" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`rounded px-3 py-2 text-sm font-semibold transition ${
                  mode === "signup" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                First admin
              </button>
            </div>

            {(formError || error) && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError || error}
              </div>
            )}
            {notice && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {notice}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "signup" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-800" htmlFor="displayName">
                    Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                    autoComplete="name"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-800" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-800" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting || loading}
                className="flex h-11 w-full items-center justify-center rounded-md bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting || loading
                  ? mode === "signin"
                    ? "Signing in..."
                    : "Creating admin..."
                  : mode === "signin"
                    ? "Sign in"
                    : "Create admin"}
              </button>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={submitting || loading}
                  className="w-full text-center text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send password reset email
                </button>
              )}
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthProvider>
  );
}
