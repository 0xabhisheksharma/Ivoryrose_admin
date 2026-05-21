"use client";

import { AdminCard } from "@/presentation/components/admin/AdminCard";

export default function AdminSettingsPage() {
  return (
    <AdminCard
      title="Settings"
      description="Admin and application settings."
    >
      <p className="text-sm text-slate-400">
        Settings and configuration options will appear here when implemented.
      </p>
    </AdminCard>
  );
}
