'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpen, GitMerge, Check, AlertCircle, Edit3, Loader2, XCircle, Search } from 'lucide-react';

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

export default function CoursesAdminPage() {
  const [courses, setCourses] = useState<DbCourse[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'official' | 'custom_pending'>('all');
  const [universityFilter, setUniversityFilter] = useState('all');
  
  // Merge state
  const [sourceCourse, setSourceCourse] = useState<DbCourse | null>(null);
  const [targetCourseId, setTargetCourseId] = useState('');
  const [merging, setMerging] = useState(false);
  const [preflight, setPreflight] = useState<CourseMergePreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Edit state
  const [editingCourse, setEditingCourse] = useState<DbCourse | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState<'official' | 'custom_pending'>('official');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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

  const loadData = async () => {
    setLoading(true);
    const [{ data: crsData, error: courseError }, { data: uniData, error: universityError }] = await Promise.all([
      supabase.from('courses').select('id, university_id, code, title, description, status').order('code').limit(500),
      supabase.from('universities').select('id, name').order('name').limit(500),
    ]);

    if (courseError || universityError) {
      setError(`Catalog data could not be loaded: ${(courseError ?? universityError)?.message}`);
      setCourses([]);
      setUniversities([]);
      setLoading(false);
      return;
    }
    if (uniData) setUniversities(uniData as University[]);

    if (crsData) {
      const mapped = crsData.map((c: any) => ({
        ...c,
        university_name: uniData?.find((u: any) => u.id === c.university_id)?.name || 'Unknown University',
      }));
      setCourses(mapped);
    }
    setLoading(false);
  };

  const visibleCourses = courses.filter((course) => {
    if (statusFilter !== 'all' && course.status !== statusFilter) return false;
    if (universityFilter !== 'all' && course.university_id !== universityFilter) return false;
    const normalized = query.trim().toLowerCase();
    return !normalized || [course.code, course.title, course.university_name || ''].some((value) => value.toLowerCase().includes(normalized));
  });

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Course & Short Code Management</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage course titles, edit short codes (e.g. `ACC-401`, `FIN-435`), and execute atomic course merging procedures.
        </p>
      </div>

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
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search code, title, or university" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-purple-500" />
        </label>
        <select value={universityFilter} onChange={(event) => setUniversityFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
          <option value="all">All universities</option>
          {universities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
          <option value="all">All statuses</option><option value="custom_pending">Pending</option><option value="official">Official</option>
        </select>
      </div>

      {/* Courses Table */}
      <div className="admin-card overflow-hidden p-0">
        <table className="w-full text-left text-sm text-slate-300">
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
            ) : visibleCourses.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No courses created yet.
                </td>
              </tr>
            ) : (
              visibleCourses.map((c) => (
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
                      onClick={() => setSourceCourse(c)}
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
                <select
                  value={targetCourseId}
                  onChange={(e) => setTargetCourseId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select target course...</option>
                  {courses
                    .filter((c) => c.id !== sourceCourse.id && c.university_id === sourceCourse.university_id)
                    .map((c) => (
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
                onClick={() => { setSourceCourse(null); setTargetCourseId(''); setPreflight(null); }}
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
    </div>
  );
}
