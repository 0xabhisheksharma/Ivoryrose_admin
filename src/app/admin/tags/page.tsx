"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminButton } from "@/presentation/components/admin/AdminButton";
import { AdminCard } from "@/presentation/components/admin/AdminCard";
import { AdminSearch } from "@/presentation/components/admin/AdminSearch";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { useConfirmAction } from "@/presentation/components/ui/useConfirmAction";
import { useAuth } from "@/presentation/auth/AuthContext";
import { useAuthenticatedFetch } from "@/presentation/auth/useAuthenticatedFetch";

type TagRow = {
  tagId: string;
  name: string;
  type: string;
  updatedAt: string | null;
};

export default function AdminTagsPage() {
  const authFetch = useAuthenticatedFetch();
  const { can } = useAuth();
  const canEditTags = can("tags.write");
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { openConfirm, confirmDialogProps } = useConfirmAction();

  const filteredTags = tags.filter((tag) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [tag.tagId, tag.name, tag.type].some((value) =>
      value.toLowerCase().includes(query)
    );
  });

  const loadTags = useCallback(() => {
    setLoading(true);
    setError(null);
    authFetch("/api/admin/tags")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTags(data);
        else setError((data as { error?: string }).error ?? "Failed to load");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Request failed"))
      .finally(() => setLoading(false));
  }, [authFetch]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  function startEdit(t: TagRow) {
    setEditingId(t.tagId);
    setEditName(t.name);
    setEditType(t.type);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/tags/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, type: editType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Save failed");
        return;
      }
      setEditingId(null);
      loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  function confirmSaveEdit() {
    if (!editingId) return;
    openConfirm({
      title: "Update tag?",
      message: "This will save the tag changes to Firestore immediately.",
      confirmLabel: "Update tag",
      onConfirm: saveEdit,
    });
  }

  async function addTag() {
    const name = newName.trim();
    const type = newType.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Create failed");
        return;
      }
      setNewName("");
      setNewType("");
      loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAdding(false);
    }
  }

  async function deleteTag(tagId: string) {
    setError(null);
    try {
      const res = await authFetch(`/api/admin/tags/${encodeURIComponent(tagId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Delete failed");
        return;
      }
      if (editingId === tagId) setEditingId(null);
      loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  function confirmDeleteTag(tagId: string, name: string) {
    openConfirm({
      title: "Delete tag?",
      message: `Delete "${name}" from Firestore? This cannot be undone.`,
      confirmLabel: "Delete tag",
      onConfirm: () => deleteTag(tagId),
    });
  }

  if (loading) {
    return (
      <AdminCard title="Tags" description="Manage product tags in Firestore.">
        <p className="text-sm text-zinc-500">Loading...</p>
      </AdminCard>
    );
  }

  return (
    <>
      <AdminCard
        title="Tags"
        description="Add, edit, or delete tags in Firestore. Tag sync from Drive is unchanged."
      >
        {canEditTags && <div className="mb-5 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tag name"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Type
            </label>
            <input
              type="text"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="Type"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />
          </div>
          <AdminButton onClick={addTag} disabled={adding || !newName.trim()}>
            {adding ? "Adding..." : "Add tag"}
          </AdminButton>
        </div>}

        <div className="mb-4">
          <AdminSearch
            label="Search tags"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, name, or type"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Tag ID
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Name
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Type
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Updated
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTags.map((t) =>
                editingId === t.tagId ? (
                  <tr key={t.tagId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{t.tagId}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full max-w-[180px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="w-full max-w-[140px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-500">-</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AdminButton size="sm" onClick={confirmSaveEdit} disabled={saving}>
                          {saving ? "Saving..." : "Save"}
                        </AdminButton>
                        <AdminButton
                          size="sm"
                          variant="secondary"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          Cancel
                        </AdminButton>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.tagId} className="border-b border-zinc-100 last:border-0 hover:bg-amber-50/40">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-900">{t.tagId}</td>
                    <td className="px-4 py-3 font-medium text-zinc-800">{t.name}</td>
                    <td className="px-4 py-3 text-zinc-700">{t.type || "-"}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AdminButton size="sm" variant="secondary" onClick={() => startEdit(t)} disabled={!canEditTags}>
                          Edit
                        </AdminButton>
                        <AdminButton
                          size="sm"
                          variant="danger"
                          onClick={() => confirmDeleteTag(t.tagId, t.name)}
                          disabled={!canEditTags}
                        >
                          Delete
                        </AdminButton>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {filteredTags.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-zinc-500">
            {tags.length === 0 ? "No tags yet." : "No tags match your search."}
          </p>
        )}
      </AdminCard>
      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}
