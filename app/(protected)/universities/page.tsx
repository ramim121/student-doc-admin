'use client';

import { useCallback, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, GitMerge, Check, AlertCircle, ChevronLeft, ChevronRight, Edit3, Layers, Loader2, Plus, Trash2, X, XCircle, Search } from 'lucide-react';
import { groupBySubject } from '@/lib/subject';

interface University {
  id: string;
  name: string;
  short: string;
  country: string;
  status: 'official' | 'custom_pending';
  created_at: string;
}

/** A course belonging to an institution, with how many documents reference it. */
interface LinkedCourse {
  id: string;
  code: string;
  title: string;
  status: 'official' | 'custom_pending';
  documentCount: number;
}

interface UniversityMergePreflight {
  sourceName: string;
  targetName: string;
  affected: Record<'departments' | 'subjects' | 'courses' | 'profiles' | 'resources', number>;
  conflicts: Record<'departments' | 'subjects' | 'courses', unknown[]>;
}

export default function UniversitiesAdminPage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'custom_pending' | 'official'>('all');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Merge dialog state
  const [sourceUni, setSourceUni] = useState<University | null>(null);
  const [targetUniId, setTargetUniId] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [mergeTargets, setMergeTargets] = useState<University[]>([]);
  const [merging, setMerging] = useState(false);
  const [preflight, setPreflight] = useState<UniversityMergePreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Edit modal state
  const [editingUni, setEditingUni] = useState<University | null>(null);
  const [editName, setEditName] = useState('');
  const [editShort, setEditShort] = useState('');
  const [editStatus, setEditStatus] = useState<'official' | 'custom_pending'>('official');
  const [saving, setSaving] = useState(false);

  // Linked courses, grouped by subject
  const [courseUni, setCourseUni] = useState<University | null>(null);
  const [linkedCourses, setLinkedCourses] = useState<LinkedCourse[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [courseQuery, setCourseQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShort, setNewShort] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newType, setNewType] = useState<'university' | 'high_school'>('university');

  useEffect(() => {
    let active = true;
    if (!sourceUni || !targetUniId) {
      setPreflight(null);
      return () => { active = false; };
    }

    setPreflightLoading(true);
    setPreflight(null);
    setError('');
    void supabase.rpc('preflight_university_merge', {
      source_univ_id: sourceUni.id,
      target_univ_id: targetUniId,
    }).then(({ data, error: preflightError }) => {
      if (!active) return;
      if (preflightError) {
        setError(`Merge preflight failed: ${preflightError.message}`);
      } else {
        setPreflight(data as UniversityMergePreflight);
      }
      setPreflightLoading(false);
    });

    return () => { active = false; };
  }, [sourceUni, targetUniId]);

  useEffect(() => {
    if (!sourceUni) {
      setMergeTargets([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const normalized = targetQuery.trim().replace(/[%_,()]/g, ' ');
      let targetLookup = supabase
        .from('universities')
        .select('id, name, short, country, status, created_at')
        .eq('status', 'official')
        .neq('id', sourceUni.id);
      if (normalized) targetLookup = targetLookup.or(`name.ilike.%${normalized}%,short.ilike.%${normalized}%`);
      void targetLookup.order('name').limit(50).then(({ data, error: lookupError }) => {
        if (lookupError) setError(`Merge targets could not be loaded: ${lookupError.message}`);
        else setMergeTargets((data ?? []) as University[]);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [sourceUni, targetQuery]);

  const pageSize = 25;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim().replace(/[%_,()]/g, ' '));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const loadUniversities = useCallback(async () => {
    setLoading(true);
    let universityQuery = supabase
      .from('universities')
      .select('id, name, short, country, status, created_at', { count: 'exact' });
    if (filter !== 'all') universityQuery = universityQuery.eq('status', filter);
    if (query) universityQuery = universityQuery.or(`name.ilike.%${query}%,short.ilike.%${query}%,country.ilike.%${query}%`);
    const from = (page - 1) * pageSize;
    const { data, count, error } = await universityQuery
      .order('name')
      .range(from, from + pageSize - 1);
    if (error) {
      setError(`Universities could not be loaded: ${error.message}`);
      setUniversities([]);
      setTotal(0);
    } else if (data) {
      setUniversities(data as University[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [filter, page, query]);

  useEffect(() => {
    void loadUniversities();
  }, [loadUniversities]);

  const openLinkedCourses = useCallback(async (university: University) => {
    setCourseUni(university);
    setLinkedCourses([]);
    setCourseQuery('');
    setSubjectFilter('all');
    setLinkedLoading(true);

    // resources(count) is an embedded aggregate over the course_id foreign key,
    // which avoids a second round trip per course just to show its document count.
    const { data, error: coursesError } = await supabase
      .from('courses')
      .select('id, code, title, status, resources(count)')
      .eq('university_id', university.id)
      .order('code');

    if (coursesError) {
      setError(`Courses could not be loaded: ${coursesError.message}`);
    } else {
      setLinkedCourses(
        (data ?? []).map((row: any) => ({
          id: row.id,
          code: row.code,
          title: row.title,
          status: row.status,
          documentCount: Array.isArray(row.resources) ? (row.resources[0]?.count ?? 0) : 0,
        })),
      );
    }
    setLinkedLoading(false);
  }, []);

  const handleExecuteMerge = async () => {
    if (!sourceUni || !targetUniId || !preflight) return;
    setMerging(true);
    setError('');
    setMessage('');

    try {
      const { error: rpcError } = await supabase.rpc('merge_universities', {
        source_univ_id: sourceUni.id,
        target_univ_id: targetUniId,
      });

      if (rpcError) throw rpcError;

      setMessage(`Successfully merged "${sourceUni.name}" into target university! All associated courses, documents, and profiles were re-linked.`);
      setSourceUni(null);
      setTargetUniId('');
      setTargetQuery('');
      setPreflight(null);
      await loadUniversities();
    } catch (err: any) {
      setError(err.message || 'Failed to execute university merge.');
    } finally {
      setMerging(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUni) return;
    setSaving(true);
    setError('');

    try {
      const { error: updateError } = await supabase.rpc('update_university_admin', {
        university_id: editingUni.id,
        new_name: editName.trim(),
        new_short: editShort.trim(),
        new_status: editStatus,
      });

      if (updateError) throw updateError;

      setMessage(`Updated university "${editName}".`);
      setEditingUni(null);
      await loadUniversities();
    } catch (err: any) {
      setError(err.message || 'Failed to update university.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    const { error: createError } = await supabase.rpc('create_university_admin', {
      new_name: newName.trim(),
      new_short: newShort.trim(),
      new_country: newCountry.trim(),
      new_institution_type: newType,
      new_status: 'official',
    });
    if (createError) setError(createError.message);
    else {
      setMessage(`Created “${newName.trim()}”.`);
      setNewName('');
      setNewShort('');
      setNewCountry('');
      setCreating(false);
      await loadUniversities();
    }
    setSaving(false);
  };

  const handleDelete = async (university: University) => {
    const reason = window.prompt(`Why are you deleting “${university.name}”?`)?.trim();
    if (!reason) return;
    if (!window.confirm(
      `Delete “${university.name}”? Its courses and departments go with it. This is audited and cannot be undone.`,
    )) return;

    setError('');
    setMessage('');
    const requestId = crypto.randomUUID();
    const { error: deleteError } = await supabase.rpc('delete_university_admin', {
      p_university_id: university.id,
      p_reason: reason,
      p_request_id: requestId,
    });
    // The RPC refuses when resources or members still point at it, and says
    // how many. Surfacing that verbatim is more useful than a generic failure.
    if (deleteError) setError(deleteError.message);
    else {
      setMessage(`Deleted “${university.name}”. Audit request: ${requestId}`);
      await loadUniversities();
    }
  };

  const rejectProposal = async (university: University) => {
    const reason = window.prompt(`Enter the reason to reject “${university.name}”:`)?.trim();
    if (!reason || !window.confirm('Reject this proposal? Dependency-free proposal records will be deleted and the action will be audited.')) return;
    setError('');
    setMessage('');
    const requestId = crypto.randomUUID();
    const { error: rejectError } = await supabase.rpc('reject_university_proposal', {
      university_id: university.id,
      reason,
      operation_request_id: requestId,
    });
    if (rejectError) setError(`Proposal rejection failed: ${rejectError.message}`);
    else {
      setMessage(`Rejected “${university.name}”. Audit request: ${requestId}`);
      await loadUniversities();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Institution Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            Add institutions, correct their details, merge duplicate user entries, and remove ones nothing depends on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCreating((open) => !open)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? 'Cancel' : 'New institution'}
        </button>
        <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
          <button
            onClick={() => { setFilter('all'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            All
          </button>
          <button
            onClick={() => { setFilter('custom_pending'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'custom_pending' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Pending Review
          </button>
          <button
            onClick={() => { setFilter('official'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'official' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Official
          </button>
        </div>
        </div>
      </div>

      {creating && (
        <section className="admin-card">
          <h2 className="font-semibold text-white">New institution</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Full name"
              className="admin-input"
            />
            <input
              value={newShort}
              onChange={(event) => setNewShort(event.target.value)}
              placeholder="Short code, e.g. EWU"
              className="admin-input"
            />
            <input
              value={newCountry}
              onChange={(event) => setNewCountry(event.target.value)}
              placeholder="Country"
              className="admin-input"
            />
            <select
              value={newType}
              onChange={(event) => setNewType(event.target.value as 'university' | 'high_school')}
              className="admin-input"
            >
              <option value="university">University</option>
              <option value="high_school">High School</option>
            </select>
          </div>
          <button
            onClick={() => void handleCreate()}
            disabled={saving || newName.trim().length < 2 || newShort.trim().length < 2 || newCountry.trim().length < 2}
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

      <label className="relative block max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} type="search" placeholder="Search name, abbreviation, or country" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-indigo-500" />
      </label>

      {/* Universities Table */}
      {/* overflow-x-auto, not overflow-hidden: on a phone the table must
          scroll inside the card rather than being clipped. */}
      <div className="admin-card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-6 py-4">University Name</th>
              <th className="px-6 py-4">Short Code</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" />
                  Loading universities...
                </td>
              </tr>
            ) : universities.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  No universities matching filter.
                </td>
              </tr>
            ) : (
              universities.map((u) => (
                <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-6 py-4 font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-400 shrink-0" />
                      {u.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{u.short}</td>
                  <td className="px-6 py-4">
                    {u.status === 'custom_pending' ? (
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 border border-amber-500/20">
                        Pending Review
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
                        setEditingUni(u);
                        setEditName(u.name);
                        setEditShort(u.short);
                        setEditStatus(u.status);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => void openLinkedCourses(u)}
                      title="See this institution's courses grouped by subject"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Linked courses
                    </button>
                    <button
                      onClick={() => { setSourceUni(u); setTargetQuery(''); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-700/50 bg-indigo-950/40 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/60"
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Merge Into...
                    </button>
                    {u.status === 'custom_pending' && (
                      <button
                        onClick={() => void rejectProposal(u)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-700/50 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/60"
                      >
                        <XCircle className="h-3.5 w-3.5" />Reject
                      </button>
                    )}
                    <button
                      onClick={() => void handleDelete(u)}
                      title="Delete. Refused while resources or members still reference it."
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
        <p>Showing {universities.length} of {total} matching universities.</p>
        {totalPages > 1 && <nav className="flex items-center gap-3" aria-label="University pages"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40"><ChevronLeft className="mr-1 h-4 w-4" />Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 disabled:opacity-40">Next<ChevronRight className="ml-1 h-4 w-4" /></button></nav>}
      </div>

      {/* Merge Modal Dialog */}
      {sourceUni && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-indigo-400" />
              Merge University Record
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              You are merging <strong className="text-amber-300">&quot;{sourceUni.name}&quot;</strong> into another university. All linked courses, resources, and profiles will be re-assigned, and &quot;{sourceUni.name}&quot; will be deleted.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Target Official University</label>
                <input value={targetQuery} onChange={(event) => { setTargetQuery(event.target.value); setTargetUniId(''); }} type="search" placeholder="Search official university targets" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                <select
                  value={targetUniId}
                  onChange={(e) => setTargetUniId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select target university...</option>
                  {mergeTargets.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.short}) {u.status === 'official' ? '✔ Official' : ''}
                      </option>
                    ))}
                </select>
              </div>
              {preflightLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />Calculating affected rows and conflicts…
                </div>
              )}
              {preflight && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Preflight impact</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-3">
                    {Object.entries(preflight.affected).map(([label, count]) => (
                      <div key={label} className="rounded-lg bg-slate-950/70 p-2">
                        <dt className="capitalize text-slate-500">{label}</dt>
                        <dd className="mt-1 text-base font-bold text-white">{count}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-slate-400">
                    Detected conflicts: {preflight.conflicts.departments.length} departments,{' '}
                    {preflight.conflicts.subjects.length} subjects, and {preflight.conflicts.courses.length} courses.
                    Matching records are resolved deterministically inside the same transaction.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setSourceUni(null); setTargetUniId(''); setTargetQuery(''); setPreflight(null); }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={merging || preflightLoading || !preflight}
                onClick={handleExecuteMerge}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                Confirm Atomic Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linked courses, grouped by subject */}
      {courseUni && (() => {
        const needle = courseQuery.trim().toLowerCase();
        const matching = linkedCourses.filter(
          (course) =>
            !needle ||
            course.code.toLowerCase().includes(needle) ||
            course.title.toLowerCase().includes(needle),
        );
        const groups = groupBySubject(matching, (course) => course.code).filter(
          (group) => subjectFilter === 'all' || group.code === subjectFilter,
        );
        // Built from every course, not the filtered set, so choosing a subject
        // does not empty the list you chose it from.
        const allSubjects = groupBySubject(linkedCourses, (course) => course.code);
        const shownCount = groups.reduce((sum, group) => sum + group.items.length, 0);

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
            <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                    <Layers className="h-5 w-5 text-indigo-400" />
                    Courses at {courseUni.short}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {courseUni.name} — {linkedCourses.length} course
                    {linkedCourses.length === 1 ? '' : 's'} across {allSubjects.length} subject
                    {allSubjects.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <button
                  onClick={() => setCourseUni(null)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <label className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={courseQuery}
                    onChange={(event) => setCourseQuery(event.target.value)}
                    type="search"
                    placeholder="Search course code or title"
                    className="admin-input w-full pl-9"
                  />
                </label>
                <select
                  value={subjectFilter}
                  onChange={(event) => setSubjectFilter(event.target.value)}
                  aria-label="Filter by subject"
                  className="admin-input sm:max-w-xs"
                >
                  <option value="all">All subjects</option>
                  {allSubjects.map((group) => (
                    <option key={group.code} value={group.code}>
                      {group.name} ({group.items.length})
                    </option>
                  ))}
                </select>
              </div>

              {linkedLoading ? (
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                  Loading courses…
                </div>
              ) : groups.length === 0 ? (
                <p className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-500">
                  {linkedCourses.length === 0
                    ? 'This institution has no courses yet.'
                    : 'No courses match those filters.'}
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {groups.map((group) => (
                    <section key={group.code} className="rounded-xl border border-slate-800 bg-slate-950">
                      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 font-mono text-xs font-bold text-indigo-300">
                            {group.code}
                          </span>
                          <span className="text-sm font-semibold text-white">{group.name}</span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {group.items.length} course{group.items.length === 1 ? '' : 's'}
                        </span>
                      </header>
                      <ul className="divide-y divide-slate-800/60">
                        {group.items.map((course) => (
                          <li
                            key={course.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                          >
                            <div className="min-w-0">
                              <span className="font-mono text-xs font-bold text-indigo-400">
                                {course.code}
                              </span>
                              <span className="ml-2 text-sm text-white">{course.title}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {course.status === 'custom_pending' && (
                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                                  Pending
                                </span>
                              )}
                              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                                {course.documentCount} doc{course.documentCount === 1 ? '' : 's'}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Showing {shownCount} of {linkedCourses.length} courses.
                </p>
                <button
                  onClick={() => setCourseUni(null)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal Dialog */}
      {editingUni && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Edit University Details</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">University Full Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Short Code</label>
                <input
                  value={editShort}
                  onChange={(e) => setEditShort(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Approval Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="official">Official Verified</option>
                  <option value="custom_pending">Custom / Pending Review</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingUni(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={handleSaveEdit}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
