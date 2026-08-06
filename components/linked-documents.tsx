'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { UNCODED, subjectCode, subjectName } from '@/lib/subject';

/**
 * The documents hanging off one catalogue row. A category spans every course
 * and institution, so the list is useless without its own search and filters -
 * hence the toolbar rather than a plain table.
 */

export type DocumentScope = {
  column: 'category_id' | 'course_id' | 'university_id';
  value: string;
};

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  file_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploader: string;
  university: string;
  courseCode: string | null;
};

type Option = { id: string; label: string };

const PAGE_SIZE = 15;

/** Supabase returns an embedded row as an object or a single-element array. */
function relationText(value: unknown, key: string, fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  const text = row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : null;
  return typeof text === 'string' && text.trim() ? text : fallback;
}

export function formatBytes(bytes: number | null) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  pending: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  rejected: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  removed: 'border-slate-600 bg-slate-800 text-slate-300',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
        STATUS_STYLES[status] ?? 'border-slate-700 bg-slate-800 text-slate-300'
      }`}
    >
      {status}
    </span>
  );
}

export function LinkedDocuments({ scope }: { scope: DocumentScope }) {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [universityFilter, setUniversityFilter] = useState('all');
  const [universities, setUniversities] = useState<Option[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim().replace(/[%_,()]/g, ' '));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  // Only offer institutions that actually appear in this scope, so the filter
  // cannot be set to something that returns nothing.
  useEffect(() => {
    void supabase
      .from('resources')
      .select('universities(id, name)')
      .eq(scope.column, scope.value)
      .limit(500)
      .then(({ data }) => {
        const seen = new Map<string, string>();
        for (const row of data ?? []) {
          const relation = Array.isArray(row.universities) ? row.universities[0] : row.universities;
          const id = (relation as { id?: string } | null)?.id;
          const name = (relation as { name?: string } | null)?.name;
          if (id && name) seen.set(id, name);
        }
        setUniversities(
          Array.from(seen.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
      });
  }, [scope.column, scope.value]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let request = supabase
      .from('resources')
      .select(
        `id, title, status, file_type, size_bytes, created_at,
         profiles(full_name), universities(name), courses(code)`,
        { count: 'exact' },
      )
      .eq(scope.column, scope.value);

    if (statusFilter !== 'all') request = request.eq('status', statusFilter);
    if (universityFilter !== 'all') request = request.eq('university_id', universityFilter);
    if (query) request = request.or(`title.ilike.%${query}%,description.ilike.%${query}%`);

    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error: queryError } = await request
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (queryError) {
      setError(`Documents could not be loaded: ${queryError.message}`);
      setRows([]);
      setTotal(0);
    } else {
      setRows(
        (data ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          file_type: row.file_type,
          size_bytes: row.size_bytes,
          created_at: row.created_at,
          uploader: relationText(row.profiles, 'full_name', 'Unknown uploader'),
          university: relationText(row.universities, 'name', 'No institution'),
          courseCode: relationText(row.courses, 'code', '') || null,
        })),
      );
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [scope.column, scope.value, statusFilter, universityFilter, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 0;
  const filtersActive = Boolean(query) || statusFilter !== 'all' || universityFilter !== 'all';

  const subjects = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => subjectCode(row.courseCode)).filter((code) => code !== UNCODED)),
      ),
    [rows],
  );

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            type="search"
            placeholder="Search document title or description"
            className="admin-input w-full pl-9"
          />
        </label>
        <select
          value={universityFilter}
          onChange={(event) => {
            setUniversityFilter(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by institution"
          className="admin-input lg:max-w-xs"
        >
          <option value="all">All institutions</option>
          {universities.map((university) => (
            <option key={university.id} value={university.id}>
              {university.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="admin-input lg:max-w-[10rem]"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="removed">Removed</option>
        </select>
      </div>

      {subjects.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Subjects on this page: {subjects.map((code) => subjectName(code)).join(', ')}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-sm text-rose-400">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[860px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Institution</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Uploader</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3 text-right">File</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" />
                  Loading documents…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {filtersActive ? 'No documents match those filters.' : 'No documents here yet.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-medium text-white">
                    {row.title}
                    {row.file_type && (
                      <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                        {row.file_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {row.courseCode ? (
                      <>
                        <span className="font-mono text-indigo-400">{row.courseCode}</span>
                        <span className="block text-slate-500">
                          {subjectName(subjectCode(row.courseCode))}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-600">No course</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{row.university}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{row.uploader}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatBytes(row.size_bytes)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/api/resources/${row.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-700/50 bg-sky-950/30 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-900/50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
        <p>
          Showing {rows.length} of {total} document{total === 1 ? '' : 's'}
          {filtersActive ? ' matching the filters' : ''}.
        </p>
        {totalPages > 1 && (
          <nav className="flex items-center gap-3" aria-label="Document pages">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
