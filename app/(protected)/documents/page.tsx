'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { StatusPill, formatBytes } from '@/components/linked-documents';
import { supabase } from '@/lib/supabase';
import { subjectCode, subjectName, subjectOptions } from '@/lib/subject';

/**
 * Every stored document, whatever its moderation state. The moderation queue
 * answers "what needs me now"; this answers "what do we actually hold" - which
 * is why it carries category, subject and storage columns the queue does not,
 * and why it defaults to all statuses instead of pending.
 */

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  file_type: string | null;
  size_bytes: number | null;
  created_at: string;
  storage_key: string | null;
  storage_provider: string | null;
  department: string | null;
  uploader: string;
  university: string;
  courseCode: string | null;
  courseTitle: string | null;
  category: string;
};

type Option = { id: string; label: string };

type Reconciliation = {
  scannedAt: string;
  truncated: boolean;
  bucket: { objectCount: number; totalBytes: number };
  database: { rowCount: number };
  matched: number;
  orphaned: Array<{ key: string; size: number; lastModified: string | null }>;
  missing: Array<{ id: string; title: string; status: string; storageKey: string }>;
};

const PAGE_SIZE = 25;

function relationText(value: unknown, key: string, fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  const text = row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : null;
  return typeof text === 'string' && text.trim() ? text : fallback;
}

export default function DocumentsAdminPage() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [universityFilter, setUniversityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const [universities, setUniversities] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [courseCodes, setCourseCodes] = useState<string[]>([]);

  const [scan, setScan] = useState<Reconciliation | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim().replace(/[%_,()]/g, ' '));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  // Filter options come from the catalogue itself, so every option is real.
  useEffect(() => {
    void supabase
      .from('universities')
      .select('id, name')
      .order('name')
      .then(({ data }) => setUniversities((data ?? []).map((row) => ({ id: row.id, label: row.name }))));
    void supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCategories((data ?? []).map((row) => ({ id: row.id, label: row.name }))));
    void supabase
      .from('courses')
      .select('code')
      .order('code')
      .then(({ data }) => setCourseCodes((data ?? []).map((row) => row.code as string)));
  }, []);

  // Subjects are derived from course codes, so the list reflects the catalogue
  // rather than being hard-coded.
  const subjects = useMemo(() => subjectOptions(courseCodes), [courseCodes]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    let request = supabase
      .from('resources')
      .select(
        `id, title, status, file_type, size_bytes, created_at,
         storage_key, storage_provider, department,
         profiles(full_name), universities(name), courses(code, title), categories(name)`,
        { count: 'exact' },
      );

    if (statusFilter !== 'all') request = request.eq('status', statusFilter);
    if (typeFilter !== 'all') request = request.eq('file_type', typeFilter);
    if (universityFilter !== 'all') request = request.eq('university_id', universityFilter);
    if (categoryFilter !== 'all') request = request.eq('category_id', categoryFilter);
    if (query) request = request.or(`title.ilike.%${query}%,description.ilike.%${query}%`);

    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error: queryError } = await request
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (queryError) {
      setError(`Documents could not be loaded: ${queryError.message}`);
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setRows(
      (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        file_type: row.file_type,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
        storage_key: row.storage_key,
        storage_provider: row.storage_provider,
        department: row.department,
        uploader: relationText(row.profiles, 'full_name', 'Unknown uploader'),
        university: relationText(row.universities, 'name', 'No institution'),
        courseCode: relationText(row.courses, 'code', '') || null,
        courseTitle: relationText(row.courses, 'title', '') || null,
        category: relationText(row.categories, 'name', 'Uncategorised'),
      })),
    );
    setTotal(count ?? 0);
    setLoading(false);
  }, [statusFilter, typeFilter, universityFilter, categoryFilter, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Subject lives inside the course code, which PostgREST cannot filter on, so
  // this narrows the loaded page. The footer says so rather than implying the
  // whole result set was filtered.
  const visible = useMemo(
    () =>
      subjectFilter === 'all'
        ? rows
        : rows.filter((row) => subjectCode(row.courseCode) === subjectFilter),
    [rows, subjectFilter],
  );

  const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 0;
  const filtersActive =
    Boolean(query) ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    universityFilter !== 'all' ||
    categoryFilter !== 'all' ||
    subjectFilter !== 'all';

  const resetFilters = () => {
    setQueryInput('');
    setStatusFilter('all');
    setTypeFilter('all');
    setUniversityFilter('all');
    setCategoryFilter('all');
    setSubjectFilter('all');
    setPage(1);
  };

  const runScan = async () => {
    setScanning(true);
    setScanError('');
    try {
      const result = await fetch('/api/storage/reconcile');
      const payload = await result.json().catch(() => null);
      if (!result.ok) {
        setScanError(payload?.error?.message || 'The bucket could not be scanned.');
        setScan(null);
      } else {
        setScan(payload as Reconciliation);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'The bucket could not be scanned.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Documents</h1>
          <p className="mt-1 text-sm text-slate-400">
            Everything held in storage, at every moderation state. Filter by institution,
            course subject, category or file type. For the approve and reject queue, use
            Resource Moderation.
          </p>
        </div>
        <button
          onClick={() => void runScan()}
          disabled={scanning}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
          {scanning ? 'Scanning bucket…' : 'Scan R2 bucket'}
        </button>
      </div>

      {scanError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {scanError}
        </div>
      )}

      {scan && (
        <section className="admin-card">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Database className="h-4 w-4 text-indigo-400" />
              Bucket vs database
            </h2>
            <button
              onClick={() => setScan(null)}
              aria-label="Dismiss scan"
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-slate-950/70 p-3">
              <dt className="text-xs text-slate-500">Objects in bucket</dt>
              <dd className="mt-1 text-lg font-bold text-white">{scan.bucket.objectCount}</dd>
            </div>
            <div className="rounded-xl bg-slate-950/70 p-3">
              <dt className="text-xs text-slate-500">Stored size</dt>
              <dd className="mt-1 text-lg font-bold text-white">{formatBytes(scan.bucket.totalBytes)}</dd>
            </div>
            <div className="rounded-xl bg-slate-950/70 p-3">
              <dt className="text-xs text-slate-500">Orphaned objects</dt>
              <dd className={`mt-1 text-lg font-bold ${scan.orphaned.length ? 'text-amber-400' : 'text-emerald-400'}`}>
                {scan.orphaned.length}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-950/70 p-3">
              <dt className="text-xs text-slate-500">Missing files</dt>
              <dd className={`mt-1 text-lg font-bold ${scan.missing.length ? 'text-rose-400' : 'text-emerald-400'}`}>
                {scan.missing.length}
              </dd>
            </div>
          </dl>

          {scan.truncated && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300">
              The bucket is larger than one scan covers, so this is a partial listing.
              Missing-file detection is skipped while the scan is partial.
            </p>
          )}

          {scan.orphaned.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-amber-300">
                Objects with no database row — nothing in the app can reach these
              </p>
              <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-slate-400">
                {scan.orphaned.map((entry) => (
                  <li key={entry.key} className="flex justify-between gap-3 rounded bg-slate-950/60 px-2 py-1">
                    <span className="truncate font-mono">{entry.key}</span>
                    <span className="shrink-0">{formatBytes(entry.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {scan.missing.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-rose-300">
                Rows whose file is not in the bucket — these downloads fail
              </p>
              <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-slate-400">
                {scan.missing.map((entry) => (
                  <li key={entry.id} className="rounded bg-slate-950/60 px-2 py-1">
                    <span className="text-white">{entry.title}</span>{' '}
                    <span className="font-mono text-slate-500">{entry.storageKey}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-600">
            Scanned {new Date(scan.scannedAt).toLocaleString()} · {scan.matched} object
            {scan.matched === 1 ? '' : 's'} matched to {scan.database.rowCount} stored row
            {scan.database.rowCount === 1 ? '' : 's'}.
          </p>
        </section>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            type="search"
            placeholder="Search document title or description"
            className="admin-input w-full pl-9"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            value={universityFilter}
            onChange={(event) => { setUniversityFilter(event.target.value); setPage(1); }}
            aria-label="Filter by institution"
            className="admin-input"
          >
            <option value="all">All institutions</option>
            {universities.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}
            aria-label="Filter by category"
            className="admin-input"
          >
            <option value="all">All categories</option>
            {categories.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            aria-label="Filter by subject"
            className="admin-input"
          >
            <option value="all">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.code} value={subject.code}>{subject.label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}
            aria-label="Filter by file type"
            className="admin-input"
          >
            <option value="all">All file types</option>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="pptx">PPTX</option>
            <option value="xlsx">XLSX</option>
            <option value="txt">TXT</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
            aria-label="Filter by status"
            className="admin-input"
          >
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="removed">Removed</option>
          </select>
        </div>
        {filtersActive && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>

      <div className="admin-card overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Subject / Curriculum</th>
              <th className="px-4 py-3">Institution</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Stored</th>
              <th className="px-4 py-3 text-right">File</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" />
                  <span className="mt-2 block">Loading documents…</span>
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                  {filtersActive ? 'No documents match those filters.' : 'No documents stored yet.'}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{row.title}</span>
                    <span className="block text-xs text-slate-500">{row.uploader}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                      {row.file_type ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{row.category}</td>
                  <td className="px-4 py-3 text-xs">
                    {row.courseCode ? (
                      <>
                        <span className="font-mono text-indigo-400">{row.courseCode}</span>
                        <span className="block text-slate-500">{row.courseTitle}</span>
                      </>
                    ) : (
                      <span className="text-slate-600">No course</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {row.courseCode ? subjectName(subjectCode(row.courseCode)) : row.department || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{row.university}</td>
                  <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatBytes(row.size_bytes)}</td>
                  <td className="px-4 py-3 text-xs">
                    {row.storage_key ? (
                      <span className="text-emerald-400" title={row.storage_key}>
                        {row.storage_provider ?? 'r2'}
                      </span>
                    ) : (
                      <span className="text-slate-600">No file</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.storage_key ? (
                      <a
                        href={`/api/resources/${row.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-700/50 bg-sky-950/30 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-900/50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
        <p>
          Showing {visible.length} of {total} document{total === 1 ? '' : 's'}
          {subjectFilter !== 'all' && ' (the subject filter applies to this page)'}.
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
            <span>Page {page} of {totalPages}</span>
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
