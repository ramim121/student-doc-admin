'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  ExternalLink,
  EyeOff,
  FileCheck,
  Loader2,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ResourceStatus = 'pending' | 'approved' | 'rejected' | 'removed';

interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  file_type: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_provider: string;
  storage_key: string | null;
  ai_summary: string | null;
  ai_status: string;
  status: ResourceStatus;
  featured: boolean;
  moderation_reason: string | null;
  created_at: string;
  uploader: string;
  university: string;
  course: string;
}

type RelationValue = Record<string, unknown> | Record<string, unknown>[] | null;

function firstRelation(value: RelationValue) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function relationText(value: RelationValue, key: string, fallback: string) {
  const relation = firstRelation(value);
  const item = relation?.[key];
  return typeof item === 'string' && item.trim() ? item : fallback;
}

const statusStyles: Record<ResourceStatus, string> = {
  pending: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  removed: 'border-slate-600 bg-slate-800 text-slate-300',
};

export default function ResourceModerationAdminPage() {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [statusFilter, setStatusFilter] = useState<ResourceStatus | 'all'>('pending');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000';

  const loadResources = async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('resources')
      .select(`
        id, title, description, file_type, mime_type, size_bytes,
        storage_provider, storage_key, ai_summary, ai_status, status,
        featured, moderation_reason, created_at,
        profiles(full_name), universities(name), courses(code, title)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (queryError) {
      setError(`Resources could not be loaded: ${queryError.message}`);
      setResources([]);
    } else {
      setResources(
        (data ?? []).map((row) => {
          const courseCode = relationText(row.courses as RelationValue, 'code', 'No course');
          const courseTitle = relationText(row.courses as RelationValue, 'title', '');
          return {
            id: row.id,
            title: row.title,
            description: row.description,
            file_type: row.file_type,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            storage_provider: row.storage_provider,
            storage_key: row.storage_key,
            ai_summary: row.ai_summary,
            ai_status: row.ai_status,
            status: row.status as ResourceStatus,
            featured: row.featured,
            moderation_reason: row.moderation_reason,
            created_at: row.created_at,
            uploader: relationText(row.profiles as RelationValue, 'full_name', 'Unknown uploader'),
            university: relationText(row.universities as RelationValue, 'name', 'No university'),
            course: courseTitle ? `${courseCode} — ${courseTitle}` : courseCode,
          };
        }),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadResources();
  }, []);

  const filteredResources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return resources.filter((resource) => {
      if (statusFilter !== 'all' && resource.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [resource.title, resource.uploader, resource.university, resource.course, resource.file_type]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, resources, statusFilter]);

  const moderate = async (
    resource: ResourceItem,
    action: 'approve' | 'reject' | 'remove' | 'feature' | 'unfeature',
  ) => {
    let reason: string | null = null;
    if (action === 'reject' || action === 'remove') {
      reason = window.prompt(`Enter the reason to ${action} “${resource.title}”:`)?.trim() || null;
      if (!reason) return;
    }

    const impact = action === 'remove'
      ? 'This immediately removes the resource from public visibility. The stored object is retained for the tracked cleanup workflow.'
      : `This will ${action} “${resource.title}”.`;
    if (!window.confirm(`${impact}\n\nContinue?`)) return;

    setBusyId(resource.id);
    setError('');
    setMessage('');
    const requestId = crypto.randomUUID();
    const { error: rpcError } = await supabase.rpc('moderate_resource', {
      resource_id: resource.id,
      moderation_action: action,
      reason,
      operation_request_id: requestId,
    });

    if (rpcError) {
      setError(`The ${action} action failed: ${rpcError.message}`);
    } else {
      setMessage(`“${resource.title}” was ${action === 'approve' ? 'approved' : `${action}d`}. Audit request: ${requestId}`);
      await loadResources();
    }
    setBusyId('');
  };

  const permanentlyDelete = async (resource: ResourceItem) => {
    const reason = window.prompt(`Enter the permanent deletion reason for “${resource.title}”:`)?.trim();
    if (!reason) return;
    const confirmation = window.prompt(`This deletes the R2 object and database record. Type DELETE to confirm:`);
    if (confirmation !== 'DELETE') return;
    setBusyId(resource.id);
    setError('');
    setMessage('');
    const result = await fetch(`/api/resources/${resource.id}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const payload = await result.json().catch(() => null);
    if (!result.ok && result.status !== 202) {
      setError(payload?.error?.message || 'Permanent deletion failed.');
    } else if (result.status === 202) {
      setMessage(`“${resource.title}” is no longer public. Object cleanup is tracked on Operations and the database row will be deleted after cleanup succeeds.`);
      await loadResources();
    } else {
      setMessage(`“${resource.title}” and its stored object were permanently deleted. Audit request: ${payload?.requestId || 'recorded'}`);
      await loadResources();
    }
    setBusyId('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resource Curation & Moderation</h1>
        <p className="mt-1 text-sm text-slate-400">
          Review lifecycle state, uploader context, storage metadata, and AI processing before publication.
        </p>
      </div>

      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-300" role="status">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-300" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-xl flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, uploader, university, course, or file type"
            aria-label="Search moderation queue"
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-indigo-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ResourceStatus | 'all')}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="removed">Removed</option>
            <option value="all">All statuses</option>
          </select>
        </label>
      </div>

      <div className="admin-card overflow-x-auto p-0">
        <table className="w-full min-w-[1050px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Resource</th>
              <th className="px-5 py-4">Uploader & catalog</th>
              <th className="px-5 py-4">Storage & AI</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-400" /><span className="mt-2 block">Loading moderation queue…</span></td></tr>
            ) : filteredResources.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No resources match the current filters.</td></tr>
            ) : filteredResources.map((resource) => (
              <tr key={resource.id} className="align-top transition-colors hover:bg-slate-900/40">
                <td className="max-w-sm px-5 py-4">
                  <div className="font-semibold text-white">{resource.title}</div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{resource.description || 'No description provided.'}</p>
                  <p className="mt-2 text-[11px] text-slate-600">Uploaded {new Date(resource.created_at).toLocaleString()}</p>
                </td>
                <td className="max-w-xs px-5 py-4 text-xs">
                  <div className="font-medium text-slate-200">{resource.uploader}</div>
                  <div className="mt-1 text-slate-500">{resource.university}</div>
                  <div className="mt-1 font-mono text-indigo-400">{resource.course}</div>
                </td>
                <td className="max-w-xs px-5 py-4 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono font-bold text-emerald-400">{resource.storage_provider.toUpperCase()}</span>
                    <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 uppercase text-slate-300">{resource.file_type}</span>
                  </div>
                  <div className="mt-2 flex items-start gap-1 text-slate-500">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                    <span>{resource.ai_status}{resource.ai_summary ? ' — summary available' : ''}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[resource.status]}`}>{resource.status}</span>
                  {resource.featured && <div className="mt-2 flex items-center gap-1 text-xs text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />Featured</div>}
                  {resource.moderation_reason && <p className="mt-2 max-w-[180px] text-xs text-slate-500">{resource.moderation_reason}</p>}
                </td>
                <td className="px-5 py-4 text-right">
                  {busyId === resource.id ? (
                    <Loader2 className="ml-auto h-5 w-5 animate-spin text-indigo-400" />
                  ) : (
                    <div className="flex flex-wrap justify-end gap-2">
                      {resource.status !== 'approved' && <ActionButton label="Approve" color="emerald" icon={FileCheck} onClick={() => void moderate(resource, 'approve')} />}
                      {resource.status === 'pending' && <ActionButton label="Reject" color="rose" icon={X} onClick={() => void moderate(resource, 'reject')} />}
                      {resource.status === 'approved' && <ActionButton label={resource.featured ? 'Unfeature' : 'Feature'} color="amber" icon={Star} onClick={() => void moderate(resource, resource.featured ? 'unfeature' : 'feature')} />}
                      {resource.status !== 'removed' && <ActionButton label="Remove" color="slate" icon={EyeOff} onClick={() => void moderate(resource, 'remove')} />}
                      {(resource.status === 'removed' || resource.status === 'rejected') && <ActionButton label="Delete permanently" color="rose" icon={Trash2} onClick={() => void permanentlyDelete(resource)} />}
                      {resource.status === 'approved' && (
                        <a href={`${portalUrl}/resource/${resource.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-indigo-700/50 bg-indigo-950/30 px-2.5 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50">
                          <ExternalLink className="h-3.5 w-3.5" />View
                        </a>
                      )}
                      {resource.storage_provider === 'r2' && resource.storage_key && (
                        <a href={`/api/resources/${resource.id}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-sky-700/50 bg-sky-950/30 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-900/50">
                          <Download className="h-3.5 w-3.5" />Review file
                        </a>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Showing at most the latest 100 resources. All changes are reauthorized and written to the immutable admin audit log.</p>
    </div>
  );
}

function ActionButton({
  label,
  color,
  icon: Icon,
  onClick,
}: {
  label: string;
  color: 'emerald' | 'rose' | 'amber' | 'slate';
  icon: typeof FileCheck;
  onClick: () => void;
}) {
  const colors = {
    emerald: 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50',
    rose: 'border-rose-700/50 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50',
    amber: 'border-amber-700/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/50',
    slate: 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700',
  };
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${colors[color]}`}>
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  );
}
