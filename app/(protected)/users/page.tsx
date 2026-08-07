'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type UserRole = 'user' | 'admin';
type AccountStatus = 'active' | 'suspended' | 'deleted';

interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  avatar: string | null;
  role: UserRole;
  account_status: AccountStatus;
  university_name: string | null;
  points: number;
  uploads: number;
  downloads: number;
  verified: boolean;
  created_at: string;
  total_count: number;
}

/** Read-only summary of what deleting an account would destroy. */
interface DeletePreflight {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  accountStatus: AccountStatus;
  points: number;
  createdAt: string;
  uploads: number;
  saves: number;
  notes: number;
  auditEntries: number;
  isSelf: boolean;
}

interface DeleteReport {
  status: string;
  deletedDocuments: number;
  remaining?: number;
  message?: string;
  documents?: Array<{ id: string; title: string; outcome: string; message?: string }>;
}

export default function UsersAdminPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [preflight, setPreflight] = useState<DeletePreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [deleteReport, setDeleteReport] = useState<DeleteReport | null>(null);
  const pageSize = 25;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(queryInput.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.rpc('admin_list_users', {
      query_text: query,
      page_number: page,
      page_size: pageSize,
    });
    if (queryError) {
      setUsers([]);
      setError(`Users could not be loaded: ${queryError.message}`);
    } else {
      const rows = (data ?? []) as ManagedUser[];
      setUsers(rows);
      setTotal(rows.length ? Number(rows[0].total_count) : 0);
    }
    setLoading(false);
  }, [page, query]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const changeRole = async (user: ManagedUser) => {
    const nextRole: UserRole = user.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`${nextRole === 'admin' ? 'Promote' : 'Demote'} “${user.full_name}” ${nextRole === 'admin' ? 'to' : 'from'} administrator? This changes privileged access immediately.`)) return;
    setBusyId(user.id);
    setError('');
    setMessage('');
    const requestId = crypto.randomUUID();
    const { error: mutationError } = await supabase.rpc('admin_change_user_role', {
      target_user_id: user.id,
      new_role: nextRole,
      operation_request_id: requestId,
    });
    if (mutationError) setError(`Role change failed: ${mutationError.message}`);
    else {
      setMessage(`${user.full_name} is now ${nextRole === 'admin' ? 'an administrator' : 'a regular user'}. Audit request: ${requestId}`);
      await loadUsers();
    }
    setBusyId('');
  };

  /**
   * Opens the confirmation with a live count of what would be destroyed.
   * Nothing is deleted here - the preflight is read-only.
   */
  const openDeleteDialog = async (user: ManagedUser) => {
    setError('');
    setMessage('');
    setDeleteTarget(user);
    setPreflight(null);
    setDeleteReport(null);
    setPreflightLoading(true);
    const response = await fetch(`/api/users/${user.id}/delete`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error?.message || 'The account details could not be loaded.');
      setDeleteTarget(null);
    } else {
      setPreflight(payload.preflight as DeletePreflight);
    }
    setPreflightLoading(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError('');
    setMessage('');
    setDeleteReport(null);

    const response = await fetch(`/api/users/${deleteTarget.id}/delete`, { method: 'POST' });
    const payload = await response.json().catch(() => null);

    if (!response.ok && response.status !== 202) {
      setError(payload?.error?.message || 'The account could not be deleted.');
    } else if (payload?.status === 'deleted') {
      setMessage(
        `Deleted ${payload.email || deleteTarget.full_name}` +
          (payload.deletedDocuments ? ` and ${payload.deletedDocuments} document(s).` : '.'),
      );
      setDeleteTarget(null);
      await loadUsers();
    } else {
      // Partial: some documents survived, so the account did too.
      setDeleteReport(payload as DeleteReport);
      await loadUsers();
    }
    setBusyId('');
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Users & Role Administration</h1><p className="mt-1 text-sm text-slate-400">Inspect support-safe account activity, manage administrator membership, and delete accounts.</p></div>
      {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-300" role="status">{message}</div>}
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-300" role="alert">{error}</div>}
      <div className="relative max-w-xl"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search name, email, or university" aria-label="Search users" className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-indigo-500" /></div>

      <div className="admin-card overflow-x-auto p-0">
        <table className="w-full min-w-[1000px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400"><tr><th className="px-5 py-4">User</th><th className="px-5 py-4">Account</th><th className="px-5 py-4">Activity</th><th className="px-5 py-4">Joined</th><th className="px-5 py-4 text-right">Privileged actions</th></tr></thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" /><span className="mt-2 block">Loading users…</span></td></tr> : users.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No users match this search.</td></tr> : users.map((user) => (
              <tr key={user.id} className="align-top hover:bg-slate-900/40">
                <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-xs font-bold text-white">{user.avatar || user.full_name.slice(0, 2).toUpperCase()}</div><div><div className="flex items-center gap-1.5 font-semibold text-white">{user.full_name}{user.verified && <BadgeCheck className="h-4 w-4 text-indigo-400" />}</div><div className="text-xs text-slate-500">{user.email}</div><div className="mt-1 text-xs text-slate-600">{user.university_name || 'No university'}</div></div></div></td>
                <td className="px-5 py-4"><div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${user.account_status === 'active' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'}`}>{user.account_status}</div><div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${user.role === 'admin' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>{user.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5" />}{user.role}</div></td>
                <td className="px-5 py-4 text-xs"><div><span className="font-bold text-white">{user.points}</span> XP</div><div className="mt-1 text-slate-500">{user.uploads} uploads · {user.downloads} downloads</div></td>
                <td className="px-5 py-4 text-xs text-slate-500">{new Date(user.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-4 text-right">{busyId === user.id ? <Loader2 className="ml-auto h-5 w-5 animate-spin text-indigo-400" /> : <div className="flex flex-wrap justify-end gap-2"><button onClick={() => void changeRole(user)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-700/50 bg-indigo-950/30 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50">{user.role === 'admin' ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{user.role === 'admin' ? 'Demote' : 'Promote'}</button><button onClick={() => void openDeleteDialog(user)} className="inline-flex items-center gap-1 rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-900/60"><Trash2 className="h-3.5 w-3.5" />Delete</button></div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <nav className="flex items-center justify-center gap-3" aria-label="User pages"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm disabled:opacity-40"><ChevronLeft className="mr-1 h-4 w-4" />Previous</button><span className="text-sm text-slate-500">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm disabled:opacity-40">Next<ChevronRight className="ml-1 h-4 w-4" /></button></nav>}

      {/* Delete confirmation. Shows the account and exactly what goes with it,
          because "Delete this user?" alone gives nothing to judge - and this
          action previously fired on a single unqualified confirm. */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-white">Delete this account?</h3>
                <p className="mt-1 text-sm text-slate-400">
                  This removes the account and its data permanently. It cannot be undone.
                </p>
              </div>
            </div>

            {preflightLoading ? (
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                Checking what this account owns…
              </div>
            ) : preflight ? (
              <>
                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <p className="font-semibold text-white">{preflight.fullName || '(no name set)'}</p>
                  <p className="text-sm text-slate-400">{preflight.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${preflight.role === 'admin' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
                      {preflight.role}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
                      {preflight.accountStatus}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
                      {preflight.points} XP
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
                      joined {new Date(preflight.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <p className="mt-4 text-sm font-semibold text-slate-300">Deleting also removes</p>
                <ul className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Uploads', value: preflight.uploads, note: 'files leave storage' },
                    { label: 'Saves', value: preflight.saves },
                    { label: 'Notes', value: preflight.notes },
                  ].map((item) => (
                    <li key={item.label} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className={`text-xl font-bold ${item.value ? 'text-rose-300' : 'text-slate-500'}`}>{item.value}</div>
                      <div className="text-xs text-slate-400">{item.label}</div>
                      {item.note && item.value > 0 && (
                        <div className="mt-0.5 text-[10px] text-slate-600">{item.note}</div>
                      )}
                    </li>
                  ))}
                </ul>

                {preflight.isSelf && (
                  <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-300">
                    This is the account you are signed in with. Deleting it would end your own session, so it is not allowed.
                  </p>
                )}
                {preflight.auditEntries > 0 && (
                  <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-300">
                    This account wrote {preflight.auditEntries} audit entries. It cannot be deleted without breaking the audit trail.
                  </p>
                )}
                {preflight.uploads > 50 && (
                  <p className="mt-3 text-xs text-slate-500">
                    Up to 50 documents are removed per run; repeat to finish.
                  </p>
                )}
              </>
            ) : null}

            {deleteReport && (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
                <p className="font-semibold text-white">
                  {deleteReport.deletedDocuments} document(s) removed
                  {typeof deleteReport.remaining === 'number' && deleteReport.remaining > 0 ? `, ${deleteReport.remaining} still to go` : ''}.
                </p>
                {deleteReport.message && <p className="mt-1 text-slate-400">{deleteReport.message}</p>}
                {deleteReport.documents?.some((d) => d.outcome !== 'deleted') && (
                  <ul className="mt-3 space-y-1 text-xs text-rose-300">
                    {deleteReport.documents.filter((d) => d.outcome !== 'deleted').map((d) => (
                      <li key={d.id}>
                        <span className="font-medium">{d.title}</span> — {d.outcome}
                        {d.message ? `: ${d.message}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setPreflight(null); setDeleteReport(null); }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDelete()}
                disabled={
                  !preflight ||
                  preflightLoading ||
                  preflight.isSelf ||
                  preflight.auditEntries > 0 ||
                  busyId === deleteTarget.id
                }
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busyId === deleteTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {preflight?.uploads
                  ? `Delete account and ${Math.min(preflight.uploads, 50)} document(s)`
                  : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
