'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, GitMerge, Check, AlertCircle, Edit3, Loader2, XCircle, Search } from 'lucide-react';

interface University {
  id: string;
  name: string;
  short: string;
  country: string;
  status: 'official' | 'custom_pending';
  created_at: string;
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
  const [query, setQuery] = useState('');
  
  // Merge dialog state
  const [sourceUni, setSourceUni] = useState<University | null>(null);
  const [targetUniId, setTargetUniId] = useState('');
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

  useEffect(() => {
    loadUniversities();
  }, []);

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

  const loadUniversities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('universities')
      .select('id, name, short, country, status, created_at')
      .order('name')
      .limit(500);
    if (error) {
      setError(`Universities could not be loaded: ${error.message}`);
      setUniversities([]);
    } else if (data) setUniversities(data as University[]);
    setLoading(false);
  };

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

  const filteredUnis = universities.filter((u) => {
    if (filter === 'custom_pending') return u.status === 'custom_pending';
    if (filter === 'official') return u.status === 'official';
    const normalized = query.trim().toLowerCase();
    return !normalized || [u.name, u.short, u.country].some((value) => value.toLowerCase().includes(normalized));
  });

  const visibleUnis = filteredUnis.filter((u) => {
    const normalized = query.trim().toLowerCase();
    return !normalized || [u.name, u.short, u.country].some((value) => value.toLowerCase().includes(normalized));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">University Management & Merging</h1>
          <p className="mt-1 text-sm text-slate-400">
            Clean up custom user entries by merging duplicates into canonical universities using atomic DB procedures.
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            All ({universities.length})
          </button>
          <button
            onClick={() => setFilter('custom_pending')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'custom_pending' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Pending Review ({universities.filter((u) => u.status === 'custom_pending').length})
          </button>
          <button
            onClick={() => setFilter('official')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'official' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Official ({universities.filter((u) => u.status === 'official').length})
          </button>
        </div>
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

      <label className="relative block max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search name, abbreviation, or country" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-indigo-500" />
      </label>

      {/* Universities Table */}
      <div className="admin-card overflow-hidden p-0">
        <table className="w-full text-left text-sm text-slate-300">
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
            ) : visibleUnis.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  No universities matching filter.
                </td>
              </tr>
            ) : (
              visibleUnis.map((u) => (
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
                      onClick={() => setSourceUni(u)}
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
                <select
                  value={targetUniId}
                  onChange={(e) => setTargetUniId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select target university...</option>
                  {universities
                    .filter((u) => u.id !== sourceUni.id && u.status === 'official')
                    .map((u) => (
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
                onClick={() => { setSourceUni(null); setTargetUniId(''); setPreflight(null); }}
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
