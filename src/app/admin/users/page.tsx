"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import {
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_PERMISSION_PRESETS,
  type AdminUserProfile,
  type Permission,
  type Role,
} from "@/domain/auth/permissions";
import { getClientFirestore } from "@/infrastructure/firebase/client";
import { COLLECTION_ADMIN_USERS } from "@/shared/constants/auth";
import { AdminButton } from "@/presentation/components/admin/AdminButton";
import { AdminBadge } from "@/presentation/components/admin/AdminBadge";
import { AdminCard } from "@/presentation/components/admin/AdminCard";
import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableRow,
} from "@/presentation/components/admin/AdminTable";
import { useAuth } from "@/presentation/auth/AuthContext";

type UserForm = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  permissions: Permission[];
  disabled: boolean;
};

const EMPTY_FORM: UserForm = {
  uid: "",
  email: "",
  displayName: "",
  role: "Staff",
  permissions: ROLE_PERMISSION_PRESETS.Staff,
  disabled: false,
};

function serializeDate(): string {
  return new Date().toISOString();
}

function toProfile(uid: string, data: Record<string, unknown>): AdminUserProfile {
  const role: Role = data.role === "Admin" || data.role === "Staff" || data.role === "Viewer" ? data.role : "Viewer";
  const permissions = Array.isArray(data.permissions)
    ? data.permissions.filter((value): value is Permission => typeof value === "string" && PERMISSIONS.includes(value as Permission))
    : [];
  return {
    uid,
    email: typeof data.email === "string" ? data.email : null,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    role,
    permissions,
    disabled: data.disabled === true,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

export default function AdminUsersPage() {
  const { user: currentUser, can } = useAuth();
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManageUsers = can("users.manage");
  const db = useMemo(() => getClientFirestore(), []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, COLLECTION_ADMIN_USERS), orderBy("email")));
      setUsers(snap.docs.map((item) => toProfile(item.id, item.data())));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function applyRole(role: Role) {
    setForm((prev) => ({
      ...prev,
      role,
      permissions: role === "Admin" ? ROLE_PERMISSION_PRESETS.Admin : ROLE_PERMISSION_PRESETS[role],
    }));
  }

  function togglePermission(permission: Permission) {
    setForm((prev) => {
      const exists = prev.permissions.includes(permission);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((item) => item !== permission)
          : [...prev.permissions, permission],
      };
    });
  }

  function startEdit(profile: AdminUserProfile) {
    setEditingUid(profile.uid);
    setForm({
      uid: profile.uid,
      email: profile.email ?? "",
      displayName: profile.displayName ?? "",
      role: profile.role,
      permissions: profile.role === "Admin" ? ROLE_PERMISSION_PRESETS.Admin : profile.permissions,
      disabled: profile.disabled === true,
    });
    setSuccess(null);
    setError(null);
  }

  function resetForm() {
    setEditingUid(null);
    setForm(EMPTY_FORM);
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageUsers) return;
    const uid = form.uid.trim();
    const email = form.email.trim();
    if (!uid || !email) {
      setError("UID and email are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const existing = users.find((item) => item.uid === uid);
      const now = serializeDate();
      await setDoc(
        doc(db, COLLECTION_ADMIN_USERS, uid),
        {
          email,
          displayName: form.displayName.trim() || null,
          role: form.role,
          permissions: form.role === "Admin" ? ROLE_PERMISSION_PRESETS.Admin : form.permissions,
          disabled: form.disabled,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          updatedBy: currentUser?.uid ?? null,
        },
        { merge: true }
      );
      setSuccess(editingUid ? "User permissions updated." : "User access created.");
      resetForm();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <AdminCard title="Users" description="Manage dashboard roles, custom permissions, and account access.">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-zinc-500">No admin users have been assigned yet.</p>
        ) : (
          <AdminTable>
            <thead>
              <AdminTableHeaderRow>
                <AdminTableHeaderCell>User</AdminTableHeaderCell>
                <AdminTableHeaderCell>Role</AdminTableHeaderCell>
                <AdminTableHeaderCell>Permissions</AdminTableHeaderCell>
                <AdminTableHeaderCell>Status</AdminTableHeaderCell>
                <AdminTableHeaderCell>Actions</AdminTableHeaderCell>
              </AdminTableHeaderRow>
            </thead>
            <AdminTableBody>
              {users.map((profile) => (
                <AdminTableRow key={profile.uid}>
                  <AdminTableCell>
                    <p className="font-medium text-zinc-900">{profile.displayName || profile.email || profile.uid}</p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-500">{profile.uid}</p>
                  </AdminTableCell>
                  <AdminTableCell className="text-zinc-700">{profile.role}</AdminTableCell>
                  <AdminTableCell className="max-w-[320px] text-xs text-zinc-600">
                    {profile.role === "Admin" ? "All permissions" : profile.permissions.join(", ") || "No permissions"}
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminBadge variant={profile.disabled ? "danger" : "success"}>
                      {profile.disabled ? "Disabled" : "Active"}
                    </AdminBadge>
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminButton size="sm" variant="secondary" onClick={() => startEdit(profile)}>
                      Edit
                    </AdminButton>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminCard>

      <AdminCard
        title={editingUid ? "Edit access" : "Add access"}
        description="Add a Firebase Auth UID, then assign a role and any custom permissions."
      >
        {(error || success) && (
          <div className={`mb-4 rounded-md border p-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {error || success}
          </div>
        )}
        <form className="space-y-4" onSubmit={saveUser}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Firebase UID</label>
            <input
              value={form.uid}
              onChange={(event) => setForm((prev) => ({ ...prev, uid: event.target.value }))}
              disabled={Boolean(editingUid)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 disabled:bg-zinc-100"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</label>
            <input
              value={form.displayName}
              onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Role</label>
            <select
              value={form.role}
              onChange={(event) => applyRole(event.target.value as Role)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            >
              <option value="Admin">Admin</option>
              <option value="Staff">Staff</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.disabled}
              onChange={(event) => setForm((prev) => ({ ...prev, disabled: event.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Disable account
          </label>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Custom permissions</p>
            <div className="grid gap-2">
              {PERMISSIONS.map((permission) => (
                <label key={permission} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${form.role === "Admin" ? "border-zinc-200 bg-zinc-50 text-zinc-400" : "border-zinc-200 bg-white text-zinc-700"}`}>
                  <input
                    type="checkbox"
                    checked={form.role === "Admin" || form.permissions.includes(permission)}
                    disabled={form.role === "Admin"}
                    onChange={() => togglePermission(permission)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {PERMISSION_LABELS[permission]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <AdminButton type="submit" disabled={saving || !canManageUsers}>
              {saving ? "Saving..." : editingUid ? "Save changes" : "Add user"}
            </AdminButton>
            {editingUid && (
              <AdminButton type="button" variant="secondary" onClick={resetForm} disabled={saving}>
                Cancel
              </AdminButton>
            )}
          </div>
        </form>
      </AdminCard>
    </div>
  );
}
