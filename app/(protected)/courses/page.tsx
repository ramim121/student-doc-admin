'use client';

import { useCallback, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpen, GitMerge, Check, AlertCircle, ChevronLeft, ChevronRight, Edit3, ExternalLink, FileText, Loader2, Plus, ShieldAlert, Trash2, X, XCircle, Search } from 'lucide-react';

interface DbCourse {
  id: string;
  university_id: string;
  code: string;
  title: string;
  description?: string;
  status: 'official' | 'custom_pending';
  university_name?: string;
}

interface University {
  id: string;
  name: string;
}

interface CourseMergePreflight {
  sourceCode: string;
  targetCode: string;
  affectedResources: number;
}

/** A document that references the course, and so blocks deleting it. */
interface BlockingResource {
  id: string;
  title: string;
  status: string;
  file_type: string | null;
  size_bytes: number | null;
  downloads: number | null;
  views: number | null;
  created_at: string;
  uploader: string;
}

interface ForceDeleteReport {
  status: 'deleted' | 'partial' | 'documents_deleted_course_kept';
  deletedCount: number;
  remaining?: number;
  message?: string;
  documents: Array<{ id: string; title: string; outcome: string; message?: string }>;
}

/** Supabase returns an embedded row as an object or a single-element array. */
function relationText(value: unknown, key: string, fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  const text = row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : null;
  return typeof text === 'string' && text.trim() ? text : fallback;
}

function formatBytes(bytes: number | null) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CoursesAdminPage() {
  const [courses, setCourses] = useState<DbCourse[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'official' | 'custom_pending'>('all');
  const [universityFilter, setUniversityFilter] = useState('all');
  const [universityQuery, setUniversityQuery] = useState('');
  
  // Merge state
  const [sourceCourse, setSourceCourse] = useState<DbCourse | null>(null);
  const [targetCourseId, setTargetCourseId] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [mergeTargets, setMergeTargets] = useState<DbCourse[]>([]);
  const [merging, setMerging] = useState(false);
  const [preflight, setPreflight] = useState<CourseMergePreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [newUniId, setNewUniId] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Blocking-document inspector and force delete
  const [blockerCourse, setBlockerCourse] = useState<DbCourse | null>(null);
  const [blockers, setBlockers] = useState<BlockingResource[]>([]);
  const [blockerTotal, setBlockerTotal] = useState(0);
  const [blockersLoading, setBlockersLoading] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [forceConfirm, setForceConfirm] = useState('');
  const [forcing, setForcing] = useState(false);
  const [forceReport, setForceReport] = useState<ForceDeleteReport | null>(null);

  // Edit state
  const [editingCourse, setEditingCourse] = useState<DbCourse | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState<'official' | 'custom_pending'>('official');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!sourceCourse || !targetCourseId) {
      setPreflight(null);
      return () => { active = false; };
    }

    setPreflightLoading(true);
    setPreflight(null);
    setError('');
    void supabase.rpc('preflight_course_merge', {
      source_course_id: sourceCourse.id,
      target_course_id: targetCourseId,
    }).then(({ data, error: preflightError }) => {
      if (!active) return;
      if (preflightError) {
        setError(`Merge preflight failed: ${preflightError.message}`);
      } else {
        setPreflight(data as CourseMergePreflight);
      }
      setPreflightLoading(false);
    });
    return () => { active = false; };
  }, [sourceCourse, targetCourseId]);

  useEffect(() => {
    if (!sourceCourse) {
      setMergeTargets([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const normalized = targetQuery.trim().replace(/[%_,()]/g, ' ');
      let targetLookup = supabase
        .from('courses')
        .select('id, university_id, code, title, description, status')
        .eq('university_id', sourceCourse.university_id)
        .eq('status', 'official')
        .neq('id', sourceCourse.id);
      if (normalized) targetLookup = targetLookup.or(`code.ilike.%${normalized}%,title.ilike.%${normalized}%`);
      void targetLookup.order('code').limit(50).then(({ data, error: lookupError }) => {
        if (lookupError) setError(`Merge targets could not be loaded: ${lookupError.message}`);
        else setMergeTargets((data ?? []) as DbCourse[]);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [sourceCourse, targetQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = universityQuery.trim().replace(/[%_,()]/g, ' ');
      let lookup = supabase.from('universities').select('id, name');
      if (normalized) lookup = lookup.ilike('name', `%${normalized}%`);
      void lookup.order('name').limit(50).then(({ data, error: lookupError }) => {
        if (lookupError) setError(`University filters could not be loaded: ${lookupError.message}`);
        else setUniversities((data ?? []) as University[]);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [universityQuery]);

  const pageSize = 25;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim().replace(/[%_,()]/g, ' '));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const loadData = useCallback(async () => {
    setLoading(true);
    let courseQuery = supabase
      .from('courses')
      .select('id, university_id, code, title, description, status, universities(name)', { count: 'exact' });
    if (statusFilter !== 'all') courseQuery = courseQuery.eq('status', statusFilter);
    if (universityFilter !== 'all') courseQuery = courseQuery.eq('university_id', universityFilter);
    if (query) courseQuery = courseQuery.or(`code.ilike.%${query}%,title.ilike.%${query}%`);
    const from = (page - 1) * pageSize;
    const { data: crsData, count, error: courseError } = await courseQuery.order('code').range(from, from + pageSize - 1);

    if (courseError) {
      setError(`Catalog data could not be loaded: ${courseError.message}`);
      setCourses([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    if (crsData) {
      const mapped = crsData.map((c: any) => ({
        ...c,
        university_name: (Array.isArray(c.universities) ? c.universities[0]?.name : c.universities?.name) || 'Unknown University',
      }));
      setCourses(mapped);
    }
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, query, statusFilter, universityFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExecuteCourseMerge = async () => {
    if (!sourceCourse || !targetCourseId || !preflight) return;
    setMerging(true);
    setError('');
    setMessage('');

    try {
      const { error: rpcError } = await supabase.rpc('merge_courses', {
        source_course_id: sourceCourse.id,
        target_course_id: targetCourseId,
      });

      if (rpcError) throw rpcError;

      setMessage(`Successfully merged course "${sourceCourse.code}" into target course! All linked resources were updated.`);
      setSourceCourse(null);
      setTargetCourseId('');
      setTargetQuery('');
      setPreflight(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to merge courses.');
    } finally {
      setMerging(false);
    }
  };

  const handleSaveCourseEdit = async () => {
    if (!editingCourse) return;
    setSaving(true);
    setError('');

    try {
      const { error: updateError } = await supabase.rpc('update_course_admin', {
        course_id: editingCourse.id,
        new_code: editCode.trim(),
        new_title: editTitle.trim(),
        new_description: editDesc.trim(),
        new_status: editStatus,
      });

      if (updateError) throw updateError;

      setMessage(`Updated course ${editCode} - ${editTitle}.`);
      setEditingCourse(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update course.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    const { error: createError } = await supabase.rpc('create_course_admin', {
      p_university_id: newUniId,
      new_code: newCode.trim(),
      new_title: newTitle.trim(),
      new_description: newDesc.trim() || null,
      new_status: 'official',
    });
    if (createError) setError(createError.message);
    else {
      setMessage(`Created “${newCode.trim()} — ${newTitle.trim()}”.`);
      setNewCode('');
      setNewTitle('');
      setNewDesc('');
      setCreating(false);
      await loadData();
    }
    setSaving(false);
  };

  /** Refreshes the linked-document list without disturbing the force-delete report. */
  const loadBlockers = useCallback(async (course: DbCourse) => {
    setBlockersLoading(true);
    const { data, count, error: blockerError } = await supabase
      .from('resources')
      .select(
        'id, title, status, file_type, size_bytes, downloads, views, created_at, profiles(full_name)',
        { count: 'exact' },
      )
      .eq('course_id', course.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (blockerError) {
      setError(`Linked documents could not be loaded: ${blockerError.message}`);
    } else {
      setBlockers(
        (data ?? []).map((row: any) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          file_type: row.file_type,
          size_bytes: row.size_bytes,
          downloads: row.downloads,
          views: row.views,
          created_at: row.created_at,
          uploader: relationText(row.profiles, 'full_name', 'Unknown uploader'),
        })),
      );
      setBlockerTotal(count ?? 0);
    }
    setBlockersLoading(false);
  }, []);

  const openBlockers = useCallback(
    async (course: DbCourse) => {
      setBlockerCourse(course);
      setBlockers([]);
      setBlockerTotal(0);
      setForceReport(null);
      setForceReason('');
      setForceConfirm('');
      await loadBlockers(course);
    },
    [loadBlockers],
  );

  const handleDelete = async (course: DbCourse) => {
    const reason = window.prompt(`Why are you deleting “${course.code} — ${course.title}”?`)?.trim();
    if (!reason) return;
    if (!window.confirm(`Delete “${course.code}”? This is audited and cannot be undone.`)) return;

    setError('');
    setMessage('');
    const requestId = crypto.randomUUID();
    const { error: deleteError } = await supabase.rpc('delete_course_admin', {
      p_course_id: course.id,
      p_reason: reason,
      p_request_id: requestId,
    });
    // 23503 is the RPC refusing because documents still reference the course.
    // Rather than leaving the admin with a bare count, open the inspector so
    // they can see exactly which documents, then merge or force delete.
    if (deleteError) {
      setError(deleteError.message);
      if (deleteError.code === '23503' || /still in use/i.test(deleteError.message)) {
        await openBlockers(course);
      }
      return;
    }
    setMessage(`Deleted “${course.code}”. Audit request: ${requestId}`);
    await loadData();
  };

  const handleForceDelete = async () => {
    if (!blockerCourse) return;
    setForcing(true);
    setError('');
    setMessage('');
    setForceReport(null);

    try {
      const result = await fetch(`/api/courses/${blockerCourse.id}/force-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: forceReason.trim(), confirm: forceConfirm.trim() }),
      });
      const payload = await result.json().catch(() => null);

      if (!result.ok && result.status !== 202 && result.status !== 409) {
        setError(payload?.error?.message || 'Force delete failed.');
        return;
      }

      setForceReport(payload as ForceDeleteReport);
      if (payload?.status === 'deleted') {
        setMessage(
          `Force deleted “${blockerCourse.code}” and ${payload.deletedCount} document(s). Audit request: ${payload.requestId}`,
        );
        setBlockerCourse(null);
      } else if (payload?.error?.message) {
        setError(payload.error.message);
      }
      await loadData();
      // Refresh the list in place so the admin sees what is left, keeping the
      // per-document report that explains why anything survived.
      if (payload?.status !== 'deleted') await loadBlockers(blockerCourse);
    } catch (err: any) {
      setError(err?.message || 'Force delete failed.');
    } finally {
      setForcing(false);
    }
  };

  const rejectProposal = async (course: DbCourse) => {
    const reason = window.prompt(`Enter the reason to reject “${course.code} — ${course.title}”:`)?.trim();
    if (!reason || !window.confirm('Reject this proposal? A dependency-free proposal is deleted and the action is audited.')) return;
    setError('');
    setMessage('');
    const requestId = crypto.randomUUID();
    const { error: rejectError } = await supabase.rpc('reject_course_proposal', {
      course_id: course.id,
      reason,
      operation_request_id: requestId,
    });
    if (rejectError) setError(`Proposal rejection failed: ${rejectError.message}`);
    else {
      setMessage(`Rejected “${course.code}”. Audit request: ${requestId}`);
      await loadData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Course & Short Code Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            Add courses, correct titles and short codes (e.g. ACC-401, FIN-435), merge duplicates, and remove ones nothing references.
          </p>
        </div>
        <button
          onClick={() => setCreating((open) => !open)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? 'Cancel' : 'New course'}
        </button>
      </div>

      {creating && (
        <section className="admin-card">
          <h2 className="font-semibold text-white">New course</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={newUniId}
              onChange={(event) => setNewUniId(event.target.value)}
              className="admin-input"
            >
              <option value="">Select institution</option>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>
                  {university.name}
                </option>
              ))}
            </select>
            <input
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              placeholder="Code, e.g. FIN-435"
              className="admin-input"
            />
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Title"
              className="admin-input"
            />
            <input
              value={newDesc}
              onChange={(event) => setNewDesc(event.target.value)}
              placeholder="Description (optional)"
              className="admin-input"
            />
          </div>
          <button
            onClick={() => void handleCreate()}
            disabled={saving || !newUniId || newCode.trim().length < 2 || newTitle.trim().length < 2}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </section>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-400 flex items-center gap-2">
          <Check className="h-4 w-4" />
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 lg:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} type="search" placeholder="Search course code or title" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-purple-500" />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={universityQuery} onChange={(event) => { setUniversityQuery(event.target.value); setUniversityFilter('all'); setPage(1); }} type="search" aria-label="Search university filters" placeholder="Find university" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <select value={universityFilter} onChange={(event) => { setUniversityFilter(event.target.value); setPage(1); }} aria-label="Filter by university" className="max-w-xs rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="all">All universities</option>
            {universities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}
          </select>
        </div>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
          <option value="all">All statuses</option><option value="custom_pending">Pending</option><option value="official">Official</option>
        </select>
      </div>

      {/* Courses Table */}
      {/* overflow-x-auto, not overflow-hidden: on a phone the table must
          scroll inside the card rather than being clipped. */}
      <div className="admin-card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-6 py-4">Short Code</th>
              <th className="px-6 py-4">Course Title</th>
              <th className="px-6 py-4">University</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-purple-400" />
                  Loading courses...
                </td>
              </tr>
            ) : courses.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No courses created yet.
                </td>
              </tr>
            ) : (
              courses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-indigo-400">{c.code}</td>
                  <td className="px-6 py-4 font-semibold text-white">{c.title}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">{c.university_name}</td>
                  <td className="px-6 py-4">
                    {c.status === 'custom_pending' ? (
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 border border-amber-500/20">
                        Pending
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                        Official
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => {
                        setEditingCourse(c);
                        setEditCode(c.code);
                        setEditTitle(c.title);
                        setEditDesc(c.description || '');
                        setEditStatus(c.status);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => { setSourceCourse(c); setTargetQuery(''); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-purple-700/50 bg-purple-950/40 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-900/60"
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Merge Into...
                    </button>
                    {c.status === 'custom_pending' && (
                      <button
                        onClick={() => void rejectProposal(c)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-700/50 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/60"
                      >
                        <XCircle className="h-3.5 w-3.5" />Reject
                      </button>
                    )}
                    <button
                      onClick={() => void openBlockers(c)}
                      title="See the documents that reference this course"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Linked docs
                    </button>
                    <button
                      onClick={() => void handleDelete(c)}
                      title="Delete. Refused while resources still reference this course."
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-900/50 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
        <p>Showing {courses.length} of {total} matching courses.</p>
        {totalPages > 1 && <nav className="flex items-center gap-3" aria-label="Course pages"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40"><ChevronLeft className="mr-1 h-4 w-4" />Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40">Next<ChevronRight className="ml-1 h-4 w-4" /></button></nav>}
      </div>

      {/* Course Merge Modal */}
      {sourceCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-purple-400" />
              Merge Course Record
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Merging <strong className="text-amber-300">&quot;{sourceCourse.code} - {sourceCourse.title}&quot;</strong> into another course. All linked resources will be updated.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Target Canonical Course</label>
                <input value={targetQuery} onChange={(event) => { setTargetQuery(event.target.value); setTargetCourseId(''); }} type="search" placeholder="Search official course targets" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none" />
                <select
                  value={targetCourseId}
                  onChange={(e) => setTargetCourseId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select target course...</option>
                  {mergeTargets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title}
                      </option>
                    ))}
                </select>
              </div>
              {preflightLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-400" />Calculating affected resources…
                </div>
              )}
              {preflight && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 text-sm text-slate-300">
                  <p className="font-semibold text-amber-300">Preflight impact</p>
                  <p className="mt-2">
                    {preflight.affectedResources} linked resource{preflight.affectedResources === 1 ? '' : 's'} will move from{' '}
                    <span className="font-mono text-white">{preflight.sourceCode}</span> to{' '}
                    <span className="font-mono text-white">{preflight.targetCode}</span>.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setSourceCourse(null); setTargetCourseId(''); setTargetQuery(''); setPreflight(null); }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={merging || preflightLoading || !preflight}
                onClick={handleExecuteCourseMerge}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                Confirm Course Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Edit Course Details</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Course Short Code (e.g. ACC-401)</label>
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Course Title</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Approval Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="official">Official Verified</option>
                  <option value="custom_pending">Custom / Pending Review</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingCourse(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={handleSaveCourseEdit}
                className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-500"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linked documents / force delete */}
      {blockerCourse && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                  <FileText className="h-5 w-5 text-indigo-400" />
                  Documents linked to {blockerCourse.code}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {blockerCourse.title} · {blockerCourse.university_name}
                </p>
              </div>
              <button
                onClick={() => setBlockerCourse(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {blockersLoading ? (
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                Loading linked documents…
              </div>
            ) : blockerTotal === 0 ? (
              <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-300">
                Nothing references this course. It can be deleted normally.
              </div>
            ) : (
              <>
                <p className="mt-4 text-sm text-slate-300">
                  <span className="font-semibold text-amber-300">{blockerTotal}</span> document
                  {blockerTotal === 1 ? '' : 's'} reference this course, which is why deleting it is
                  refused.
                  {blockerTotal > blockers.length && ` Showing the ${blockers.length} most recent.`}
                </p>

                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
                    <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Document</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Uploader</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Activity</th>
                        <th className="px-4 py-3">Uploaded</th>
                        <th className="px-4 py-3 text-right">File</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {blockers.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-900/40">
                          <td className="px-4 py-3 font-medium text-white">
                            {doc.title}
                            {doc.file_type && (
                              <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                                {doc.file_type}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs capitalize text-slate-300">
                              {doc.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">{doc.uploader}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{formatBytes(doc.size_bytes)}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {doc.downloads ?? 0} downloads · {doc.views ?? 0} views
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={`/api/resources/${doc.id}/file`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-700/50 bg-sky-950/30 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-900/50"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-sm text-slate-300">
                    <strong className="text-white">Keep the documents:</strong> merge this course
                    into another one and every document above moves across.
                  </p>
                  <button
                    onClick={() => {
                      const course = blockerCourse;
                      setBlockerCourse(null);
                      setSourceCourse(course);
                      setTargetQuery('');
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-purple-700/50 bg-purple-950/40 px-4 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-900/60"
                  >
                    <GitMerge className="h-4 w-4" />
                    Merge into another course
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-rose-800/60 bg-rose-950/20 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                    <ShieldAlert className="h-4 w-4" />
                    Force delete
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    Permanently deletes the {blockerTotal} document
                    {blockerTotal === 1 ? '' : 's'} above — including the stored file
                    {blockerTotal === 1 ? '' : 's'} — and then the course. Every removal is audited
                    individually. This cannot be undone.
                    {blockerTotal > 50 && ' Up to 50 documents are handled per run.'}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-300">Reason (audited)</span>
                      <input
                        value={forceReason}
                        onChange={(event) => setForceReason(event.target.value)}
                        placeholder="Why is this being destroyed?"
                        className="admin-input mt-1 w-full"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-300">
                        Type <span className="font-mono text-white">{blockerCourse.code}</span> to confirm
                      </span>
                      <input
                        value={forceConfirm}
                        onChange={(event) => setForceConfirm(event.target.value)}
                        placeholder={blockerCourse.code}
                        className="admin-input mt-1 w-full"
                      />
                    </label>
                  </div>

                  <button
                    onClick={() => void handleForceDelete()}
                    disabled={
                      forcing ||
                      forceReason.trim().length < 3 ||
                      forceConfirm.trim() !== blockerCourse.code
                    }
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {forcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {forcing
                      ? 'Deleting documents…'
                      : `Force delete ${blockerTotal} document${blockerTotal === 1 ? '' : 's'} and the course`}
                  </button>
                </div>
              </>
            )}

            {forceReport && (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
                <p className="font-semibold text-white">
                  {forceReport.deletedCount} document{forceReport.deletedCount === 1 ? '' : 's'} deleted
                  {typeof forceReport.remaining === 'number' && forceReport.remaining > 0
                    ? `, ${forceReport.remaining} still linked`
                    : ''}
                  .
                </p>
                {forceReport.message && <p className="mt-1 text-slate-400">{forceReport.message}</p>}
                {forceReport.documents.some((doc) => doc.outcome !== 'deleted') && (
                  <ul className="mt-3 space-y-1 text-xs text-rose-300">
                    {forceReport.documents
                      .filter((doc) => doc.outcome !== 'deleted')
                      .map((doc) => (
                        <li key={doc.id}>
                          <span className="font-medium">{doc.title}</span> — {doc.outcome}
                          {doc.message ? `: ${doc.message}` : ''}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setBlockerCourse(null)}
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
