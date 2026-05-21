"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Permission } from "@/domain/auth/permissions";
import { useAuth } from "@/presentation/auth/AuthContext";

export function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: Permission;
}) {
  const { user, loading, error, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB] px-4">
        <div className="rounded-lg border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-600 shadow-sm">
          Checking access...
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB] px-4">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-semibold text-zinc-900">Access unavailable</h1>
          <p className="mt-2 text-sm text-zinc-600">{error}</p>
        </div>
      </div>
    );
  }

  if (permission && !can(permission)) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        You do not have permission to access this section.
      </div>
    );
  }

  return <>{children}</>;
}

