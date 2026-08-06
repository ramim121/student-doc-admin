'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Edit3,
  FileText,
  GitMerge,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { LinkedDocuments } from '@/components/linked-documents';
import { supabase } from '@/lib/supabase';

interface DbCategory {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  resource_count: number;
  created_at: string;
}

const EMPTY_DRAFT = { name: '', icon: '', description: '' };

/**
 * The delete RPCs require a reason and record it in admin_audit_log. Admins are
 * not asked to type one, so this is what the audit trail carries.
 */
const AUDIT_REASON = 'Deleted from the admin console';

export default function CategoriesAdminPage() {
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const [editing, setEditing] = useState<DbCategory | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);

  const [mergeSource, setMergeSource] = useState<DbCategory | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');

  const [inspecting, setInspecting] = useState<DbCategory | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_list_categories');
    if (rpcError) setError(`Categories could not be loaded: ${rpcError.message}`);
    else setCategories((data ?? []) as DbCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visible = categories.filter((category) =>
    query.trim() ? category.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  const run = async (
    label: string,
    action: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    setBusy(true);
    setError('');
    setMessage('');
    const { error: actionError } = await action();
    if (actionError) setError(actionError.message);
    else {
      setMessage(label);
      await loadData();
    }
    setBusy(false);
    return !actionError;
  };

  const handleCreate = async () => {
    const ok = await run(`Created "${draft.name.trim()}".`, () =>
      supabase.rpc('create_category_admin', {
        new_name: draft.name.trim(),
        new_icon: draft.icon.trim() || null,
        new_description: draft.description.trim() || null,
      }),
    );
    if (ok) {
      setDraft(EMPTY_DRAFT);
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const ok = await run(`Updated "${editDraft.name.trim()}".`, () =>
      supabase.rpc('update_category_admin', {
        category_id: editing.id,
        new_name: editDraft.name.trim(),
        new_icon: editDraft.icon.trim() || null,
        new_description: editDraft.description.trim() || null,
      }),
    );
    if (ok) setEditing(null);
  };

  const handleDelete = async (category: DbCategory) => {
    if (!window.confirm(`Delete "${category.name}"? This is audited and cannot be undone.`)) return;

    await run(`Deleted "${category.name}".`, () =>
      supabase.rpc('delete_category_admin', {
        p_category_id: category.id,
        p_reason: AUDIT_REASON,
        p_request_id: crypto.randomUUID(),
      }),
    );
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTargetId) return;
    const target = categories.find((category) => category.id === mergeTargetId);
    if (!target) return;
    if (
      !window.confirm(
        `Move all ${mergeSource.resource_count} resources from "${mergeSource.name}" into "${target.name}" and delete "${mergeSource.name}"?`,
      )
    ) {
      return;
    }

    const ok = await run(`Merged "${mergeSource.name}" into "${target.name}".`, () =>
      supabase.rpc('merge_categories', {
        source_category_id: mergeSource.id,
        target_category_id: target.id,
        operation_request_id: crypto.randomUUID(),
      }),
    );
    if (ok) {
      setMergeSource(null);
      setMergeTargetId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Category Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            Categories are the document types students pick when uploading, and the
            filters they browse by. Renaming one updates it everywhere it appears.
          </p>
        </div>
        <button
          onClick={() => {
            setCreating((open) => !open);
            setDraft(EMPTY_DRAFT);
          }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? 'Cancel' : 'New category'}
        </button>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-400"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {creating && (
        <section className="admin-card">
          <h2 className="font-semibold text-white">New category</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Name, e.g. Lab Reports"
              className="admin-input"
            />
            <input
              value={draft.icon}
              onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
              placeholder="Lucide icon, e.g. FlaskConical"
              className="admin-input"
            />
            <input
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="Short description"
              className="admin-input"
            />
          </div>
          <button
            onClick={() => void handleCreate()}
            disabled={busy || draft.name.trim().length < 2}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </section>
      )}

      {mergeSource && (
        <section className="admin-card border-amber-900/40 bg-amber-950/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-amber-200">
                Merge &ldquo;{mergeSource.name}&rdquo; into another category
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Its {mergeSource.resource_count} resources move to the target, then
                &ldquo;{mergeSource.name}&rdquo; is deleted. This is how you retire a
                category that is still in use.
              </p>
            </div>
            <button
              onClick={() => {
                setMergeSource(null);
                setMergeTargetId('');
              }}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800"
              aria-label="Cancel merge"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select
              value={mergeTargetId}
              onChange={(event) => setMergeTargetId(event.target.value)}
              className="admin-input flex-1"
            >
              <option value="">Select the category to keep</option>
              {categories
                .filter((category) => category.id !== mergeSource.id)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.resource_count} resources)
                  </option>
                ))}
            </select>
            <button
              onClick={() => void handleMerge()}
              disabled={busy || !mergeTargetId}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Merge
            </button>
          </div>
        </section>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter categories"
          className="admin-input w-full pl-9"
        />
      </div>

      <div className="admin-card overflow-hidden p-0">
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        ) : !visible.length ? (
          <p className="p-8 text-center text-sm text-slate-500">
            {query ? 'No categories match that filter.' : 'No categories yet.'}
          </p>
        ) : (
          <div className="divide-y divide-slate-800">
            {visible.map((category) => (
              <div key={category.id} className="p-4 sm:p-5">
                {editing?.id === category.id ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        autoFocus
                        value={editDraft.name}
                        onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                        placeholder="Name"
                        className="admin-input"
                      />
                      <input
                        value={editDraft.icon}
                        onChange={(event) => setEditDraft({ ...editDraft, icon: event.target.value })}
                        placeholder="Lucide icon"
                        className="admin-input"
                      />
                      <input
                        value={editDraft.description}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, description: event.target.value })
                        }
                        placeholder="Description"
                        className="admin-input"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleUpdate()}
                        disabled={busy || editDraft.name.trim().length < 2}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag className="h-4 w-4 shrink-0 text-indigo-400" />
                        <span className="font-semibold text-white">{category.name}</span>
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                          {category.resource_count} resources
                        </span>
                        {category.icon && (
                          <span className="text-xs text-slate-500">icon: {category.icon}</span>
                        )}
                      </div>
                      {category.description && (
                        <p className="mt-1 text-sm text-slate-400">{category.description}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-600">
                        Added {new Date(category.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        onClick={() => setInspecting(category)}
                        title="See every document in this category, across all courses and institutions"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Linked docs
                      </button>
                      <button
                        onClick={() => {
                          setEditing(category);
                          setEditDraft({
                            name: category.name,
                            icon: category.icon ?? '',
                            description: category.description ?? '',
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setMergeSource(category);
                          setMergeTargetId('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                      >
                        <GitMerge className="h-3.5 w-3.5" />
                        Merge
                      </button>
                      <button
                        onClick={() => void handleDelete(category)}
                        disabled={busy}
                        title={
                          category.resource_count > 0
                            ? 'In use - merge it instead of deleting'
                            : 'Delete this category'
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-900/50 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents in this category, across every course and institution */}
      {inspecting && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                  <FileText className="h-5 w-5 text-indigo-400" />
                  Documents in {inspecting.name}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Every document with this category, whatever its course or institution.
                  {inspecting.resource_count > 0 &&
                    ` ${inspecting.resource_count} in total.`}
                </p>
              </div>
              <button
                onClick={() => setInspecting(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              <LinkedDocuments scope={{ column: 'category_id', value: inspecting.id }} />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setInspecting(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
