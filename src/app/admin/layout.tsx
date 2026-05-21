"use client";

import { AuthProvider } from "@/presentation/auth/AuthContext";
import { AdminShell } from "@/presentation/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
