'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Building2,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DashboardOverview {
  universities: { total: number; pending: number };
  courses: { total: number; pending: number };
  resources: { total: number; pending: number; approved: number; rejected: number; removed: number };
  failedAiJobs: number;
  pendingCleanupJobs: number;
  recentActivity: Array<{
    id: string;
    action: string;
    target_type: string;
    target_id: string | null;
    request_id: string | null;
    created_at: string;
  }>;
}
const emptyOverview: DashboardOverview = {
  universities: { total: 0, pending: 0 },
  courses: { total: 0, pending: 0 },
  resources: { total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 },
  failedAiJobs: 0,
  pendingCleanupJobs: 0,
  recentActivity: [],
};

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.rpc('admin_dashboard_overview');
    if (queryError) {
      setError(`Operational overview could not be loaded: ${queryError.message}`);
    } else if (!data) {
      setError('Operational overview returned no data.');
    } else {
      setOverview(data as DashboardOverview);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Overview Dashboard</h1>
          <p className="mt-1 text-slate-400">
            Live moderation, catalog, AI, cleanup, and audit health from the database.
          </p>
        </div>
        <button
          onClick={() => void loadOverview()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-300" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><p>{error}</p><button onClick={() => void loadOverview()} className="mt-2 font-semibold underline">Try again</button></div>
        </div>
      )}

      {loading && overview === emptyOverview ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
        </div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Universities" value={overview.universities.total} icon={Building2} color="text-indigo-400" detail={`${overview.universities.pending} proposals pending`} warning={overview.universities.pending > 0} />
            <StatCard title="Courses & Codes" value={overview.courses.total} icon={BookOpen} color="text-purple-400" detail={`${overview.courses.pending} proposals pending`} warning={overview.courses.pending > 0} />
            <StatCard title="Resources" value={overview.resources.total} icon={FileText} color="text-emerald-400" detail={`${overview.resources.pending} pending · ${overview.resources.approved} approved`} warning={overview.resources.pending > 0} />
            <StatCard title="Failed AI Jobs" value={overview.failedAiJobs} icon={Sparkles} color="text-rose-400" detail={`${overview.pendingCleanupJobs} object cleanup jobs need attention`} warning={overview.failedAiJobs > 0 || overview.pendingCleanupJobs > 0} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
            <section className="admin-card">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Recent privileged activity</h2>
                  <p className="mt-1 text-xs text-slate-500">The latest audited mutations and merge operations.</p>
                </div>
              </div>
              {overview.recentActivity.length === 0 ? (
                <p className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 text-center text-sm text-slate-500">No audited activity has been recorded yet.</p>
              ) : (
                <div className="mt-5 divide-y divide-slate-800">
                  {overview.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{activity.action.replaceAll('.', ' ')}</p>
                        <p className="mt-1 text-xs text-slate-500">{activity.target_type} · {activity.target_id || 'no target id'}</p>
                      </div>
                      <time className="shrink-0 text-xs text-slate-500" dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <QuickLink href="/resources" title="Moderate resources" description={`${overview.resources.pending} pending, ${overview.resources.rejected} rejected, ${overview.resources.removed} removed`} icon={FileText} color="bg-emerald-600" />
              <QuickLink href="/universities" title="Review universities" description="Approve, normalize, inspect merge impact, and merge proposals." icon={Building2} color="bg-indigo-600" />
              <QuickLink href="/courses" title="Curate courses" description="Normalize course codes and merge compatible records." icon={BookOpen} color="bg-purple-600" />
              <div className="admin-card flex items-start gap-3 border-amber-900/40 bg-amber-950/10">
                <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div><p className="font-semibold text-amber-200">Cleanup visibility</p><p className="mt-1 text-sm text-slate-400">{overview.pendingCleanupJobs} pending or failed object cleanup jobs.</p></div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, detail, warning }: { title: string; value: number; icon: typeof Building2; color: string; detail: string; warning: boolean }) {
  return (
    <div className="admin-card">
      <div className="flex items-center justify-between text-slate-400"><span className="text-sm font-medium">{title}</span><Icon className={`h-5 w-5 ${color}`} /></div>
      <div className="mt-3 text-3xl font-bold text-white">{value}</div>
      <div className={`mt-2 flex items-center gap-1 text-xs ${warning ? 'text-amber-400' : 'text-slate-500'}`}>{warning && <AlertCircle className="h-3.5 w-3.5" />}{detail}</div>
    </div>
  );
}

function QuickLink({ href, title, description, icon: Icon, color }: { href: string; title: string; description: string; icon: typeof Building2; color: string }) {
  return (
    <Link href={href} className="admin-card group flex items-start gap-4 transition hover:border-slate-700 hover:bg-slate-900">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color} text-white`}><Icon className="h-5 w-5" /></div>
      <div className="flex-1"><h3 className="font-bold text-white">{title}</h3><p className="mt-1 text-sm text-slate-400">{description}</p></div>
      <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-slate-300" />
    </Link>
  );
}
