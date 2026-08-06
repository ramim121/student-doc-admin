'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
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

interface FilterOption { id: string; label: string }

type RelationValue = Record<string, unknown> | Record<string, unknown>[] | null;

function firstRelation(value: RelationValue) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function relationText(value: RelationValue, key: string, fallback: string) {
  const relation = firstRelation(value);
  const item = relation?.[key];
  return typeof item === 'string' && item.trim() ? item : fallback;
}

/**
 * The delete route requires a reason and records it in admin_audit_log. Admins
 * are not asked to type one, so this is what the audit trail carries. Moderation
 * rejections still ask, because that reason is feedback about the document.
 */
const PERMANENT_DELETE_REASON = 'Permanently deleted from the admin console';

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
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [uploaderFilter, setUploaderFilter] = useState('all');
  const [universityFilter, setUniversityFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [uploaderQuery, setUploaderQuery] = useState('');
  const [universityQuery, setUniversityQuery] = useState('');
  const [courseQuery, setCourseQuery] = useState('');
  const [uploaderOptions, setUploaderOptions] = useState<FilterOption[]>([]);
  const [universityOptions, setUniversityOptions] = useState<FilterOption[]>([]);
  const [courseOptions, setCourseOptions] = useState<FilterOption[]>([]);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000';
  const pageSize = 25;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim().replace(/[%_,()]/g, ' '));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = uploaderQuery.trim().replace(/[%_,()]/g, ' ');
      let lookup = supabase.from('profiles').select('id, full_name');
      if (normalized) lookup = lookup.ilike('full_name', `%${normalized}%`);
      void lookup.order('full_name').limit(50).then(({ data, error: lookupError }) => {
        if (lookupError) setError(`Uploader filters could not be loaded: ${lookupError.message}`);
        else setUploaderOptions((data ?? []).map((row) => ({ id: row.id, label: row.full_name || 'Unnamed user' })));
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [uploaderQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = universityQuery.trim().replace(/[%_,()]/g, ' ');
      let lookup = supabase.from('universities').select('id, name');
      if (normalized) lookup = lookup.ilike('name', `%${normalized}%`);
      void lookup.order('name').limit(50).then(({ data, error: lookupError }) => {
        if (lookupError) setError(`University filters could not be loaded: ${lookupError.message}`);
        else setUniversityOptions((data ?? []).map((row) => ({ id: row.id, label: row.name })));
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [universityQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = courseQuery.trim().replace(/[%_,()]/g, ' ');
      let lookup = supabase.from('courses').select('id, code, title');
      if (universityFilter !== 'all') lookup = lookup.eq('university_id', universityFilter);
      if (normalized) lookup = lookup.or(`code.ilike.%${normalized}%,title.ilike.%${normalized}%`);
      void lookup.order('code').limit(50).then(({ data, error: lookupError }) => {
        if (lookupError) setError(`Course filters could not be loaded: ${lookupError.message}`);
        else setCourseOptions((data ?? []).map((row) => ({ id: row.id, label: `${row.code} — ${row.title}` })));
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [courseQuery, universityFilter]);

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError('');
    let resourceQuery = supabase
      .from('resources')
      .select(`
        id, title, description, file_type, mime_type, size_bytes,
        storage_provider, storage_key, ai_summary, ai_status, status,
        featured, moderation_reason, created_at,
        profiles(full_name), universities(name), courses(code, title)
      `, { count: 'exact' });
    if (statusFilter !== 'all') resourceQuery = resourceQuery.eq('status', statusFilter);
    if (fileTypeFilter !== 'all') resourceQuery = resourceQuery.eq('file_type', fileTypeFilter);
    if (uploaderFilter !== 'all') resourceQuery = resourceQuery.eq('uploader_id', uploaderFilter);
    if (universityFilter !== 'all') resourceQuery = resourceQuery.eq('university_id', universityFilter);
    if (courseFilter !== 'all') resourceQuery = resourceQuery.eq('course_id', courseFilter);
    if (query) resourceQuery = resourceQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
    if (dateFilter !== 'all') {
      const days = Number(dateFilter);
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      resourceQuery = resourceQuery.gte('created_at', since);
    }
    const from = (page - 1) * pageSize;
    const { data, count, error: queryError } = await resourceQuery
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (queryError) {
      setError(`Resources could not be loaded: ${queryError.message}`);
      setResources([]);
      setTotal(0);
    } else {
      setTotal(count ?? 0);
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
  }, [courseFilter, dateFilter, fileTypeFilter, page, query, statusFilter, universityFilter, uploaderFilter]);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

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
    if (
      !window.confirm(
        `Permanently delete “${resource.title}”? The stored file goes too. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(resource.id);
    setError('');
    setMessage('');
    const result = await fetch(`/api/resources/${resource.id}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: PERMANENT_DELETE_REASON }),
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
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search title or description"
            aria-label="Search moderation queue"
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-indigo-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Status
          <select
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value as ResourceStatus | 'all'); setPage(1); }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="removed">Removed</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-400">File
          <select value={fileTypeFilter} onChange={(event) => { setFileTypeFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
            <option value="all">All types</option><option value="pdf">PDF</option><option value="docx">DOCX</option><option value="pptx">PPTX</option><option value="xlsx">XLSX</option><option value="txt">TXT</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-400">Uploaded
          <select value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
            <option value="all">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last year</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 md:grid-cols-3">
        <FilterLookup label="Uploader" query={uploaderQuery} setQuery={(value) => { setUploaderQuery(value); setUploaderFilter('all'); setPage(1); }} value={uploaderFilter} setValue={(value) => { setUploaderFilter(value); setPage(1); }} options={uploaderOptions} placeholder="Find uploader" />
        <FilterLookup label="University" query={universityQuery} setQuery={(value) => { setUniversityQuery(value); setUniversityFilter('all'); setCourseFilter('all'); setPage(1); }} value={universityFilter} setValue={(value) => { setUniversityFilter(value); setCourseFilter('all'); setCourseQuery(''); setPage(1); }} options={universityOptions} placeholder="Find university" />
        <FilterLookup label="Course" query={courseQuery} setQuery={(value) => { setCourseQuery(value); setCourseFilter('all'); setPage(1); }} value={courseFilter} setValue={(value) => { setCourseFilter(value); setPage(1); }} options={courseOptions} placeholder="Find course code or title" />
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
            ) : resources.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No resources match the current filters.</td></tr>
            ) : resources.map((resource) => (
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
      <div className="flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
        <p>Showing {resources.length} of {total} matching resources. All changes are reauthorized and written to the immutable admin audit log.</p>
        {totalPages > 1 && <nav className="flex items-center gap-3" aria-label="Moderation pages"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40"><ChevronLeft className="mr-1 h-4 w-4" />Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40">Next<ChevronRight className="ml-1 h-4 w-4" /></button></nav>}
      </div>
    </div>
  );
}

function FilterLookup({
  label, query, setQuery, value, setValue, options, placeholder,
}: {
  label: string;
  query: string;
  setQuery: (value: string) => void;
  value: string;
  setValue: (value: string) => void;
  options: FilterOption[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400">
        {label}
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="mt-1 h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-indigo-500" />
      </label>
      <select value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Filter by ${label.toLowerCase()}`} className="mt-2 h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-indigo-500">
        <option value="all">All {label === 'University' ? 'universities' : `${label.toLowerCase()}s`}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
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
