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
  UserCheck,
  UserX,
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

  const changeAccountStatus = async (user: ManagedUser) => {
    const nextStatus: AccountStatus = user.account_status === 'active' ? 'suspended' : 'active';
    let reason = '';
    if (nextStatus === 'suspended') {
      reason = window.prompt(`Enter the suspension reason for “${user.full_name}”:`)?.trim() || '';
      if (!reason) return;
    }
    if (!window.confirm(`${nextStatus === 'suspended' ? 'Suspend' : 'Reactivate'} “${user.full_name}”? ${nextStatus === 'suspended' ? 'Upload, download, note mutations, AI requests, and admin access will be blocked.' : 'Normal access will be restored.'}`)) return;
    setBusyId(user.id);
    setError('');
    setMessage('');
    const requestId = crypto.randomUUID();
    const { error: mutationError } = await supabase.rpc('admin_set_account_status', {
      target_user_id: user.id,
      new_status: nextStatus,
      reason,
      operation_request_id: requestId,
    });
    if (mutationError) setError(`Account status change failed: ${mutationError.message}`);
    else {
      setMessage(`${user.full_name} is now ${nextStatus}. Audit request: ${requestId}`);
      await loadUsers();
    }
    setBusyId('');
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Users & Role Administration</h1><p className="mt-1 text-sm text-slate-400">Inspect support-safe account activity, suspend access, and manage administrator membership.</p></div>
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
                <td className="px-5 py-4 text-right">{busyId === user.id ? <Loader2 className="ml-auto h-5 w-5 animate-spin text-indigo-400" /> : <div className="flex justify-end gap-2"><button onClick={() => void changeRole(user)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-700/50 bg-indigo-950/30 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50">{user.role === 'admin' ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{user.role === 'admin' ? 'Demote' : 'Promote'}</button>{user.account_status !== 'deleted' && <button onClick={() => void changeAccountStatus(user)} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${user.account_status === 'active' ? 'border-rose-700/50 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50' : 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50'}`}>{user.account_status === 'active' ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}{user.account_status === 'active' ? 'Suspend' : 'Reactivate'}</button>}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <nav className="flex items-center justify-center gap-3" aria-label="User pages"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm disabled:opacity-40"><ChevronLeft className="mr-1 h-4 w-4" />Previous</button><span className="text-sm text-slate-500">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm disabled:opacity-40">Next<ChevronRight className="ml-1 h-4 w-4" /></button></nav>}
    </div>
  );
}
