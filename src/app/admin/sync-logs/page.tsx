"use client";

import { AdminCard } from "@/presentation/components/admin/AdminCard";

export default function AdminSyncLogsPage() {
  return (
    <AdminCard
      title="Sync Logs"
      description="View history of sync operations for tags and rates."
    >
      <p className="text-sm text-slate-400">
        Sync logs and run history will appear here when implemented.
      </p>
    </AdminCard>
  );
}
