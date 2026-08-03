'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Cloud, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CleanupJob {
  id: string;
  storage_provider: string;
  storage_key: string;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  last_error_code: string | null;
  next_attempt_at: string;
  created_at: string;
}

interface AiJob {
  id: string;
  resource_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error_code: string | null;
  next_attempt_at: string;
  resources: { title?: string } | { title?: string }[] | null;
}

export default function OperationsPage() {
  const [cleanupJobs, setCleanupJobs] = useState<CleanupJob[]>([]);
  const [aiJobs, setAiJobs] = useState<AiJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadOperations = useCallback(async () => {
    setLoading(true);
    setError('');
    const [cleanupResult, aiResult] = await Promise.all([
      supabase.from('storage_cleanup_jobs').select('id, storage_provider, storage_key, reason, status, attempts, last_error_code, next_attempt_at, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('ai_processing_jobs').select('id, resource_id, status, attempts, max_attempts, last_error_code, next_attempt_at, resources(title)').in('status', ['queued', 'processing', 'failed']).order('next_attempt_at').limit(100),
    ]);
    const firstError = cleanupResult.error ?? aiResult.error;
    if (firstError) setError(`Operational jobs could not be loaded: ${firstError.message}`);
    else {
      setCleanupJobs((cleanupResult.data ?? []) as CleanupJob[]);
      setAiJobs((aiResult.data ?? []) as AiJob[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadOperations(); }, [loadOperations]);

  const retryCleanup = async (job: CleanupJob) => {
    if (!window.confirm(`Retry deletion for this ${job.storage_provider.toUpperCase()} object? The database audit log will record the outcome.`)) return;
    setBusyId(job.id); setError(''); setMessage('');
    const result = await fetch(`/api/cleanup/${job.id}`, { method: 'POST' });
    const body = await result.json();
    if (!result.ok) setError(body.error?.message ?? 'Cleanup retry failed.');
    else setMessage(`Cleanup completed. Audit request: ${body.requestId}`);
    await loadOperations(); setBusyId('');
  };

  const retryAi = async (job: AiJob) => {
    if (!window.confirm('Queue this AI job for another processing attempt?')) return;
    setBusyId(job.id); setError(''); setMessage('');
    const requestId = crypto.randomUUID();
    const { error: rpcError } = await supabase.rpc('admin_retry_ai_job', {
      ai_job_id: job.id,
      operation_request_id: requestId,
    });
    if (rpcError) setError(`AI retry failed: ${rpcError.message}`);
    else setMessage(`AI job queued. Audit request: ${requestId}`);
    await loadOperations(); setBusyId('');
  };

  const resourceTitle = (job: AiJob) => {
    const relation = Array.isArray(job.resources) ? job.resources[0] : job.resources;
    return relation?.title || job.resource_id;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Operational Recovery</h1><p className="mt-1 text-sm text-slate-400">Inspect and retry tracked Cloudflare R2 cleanup and AI processing failures.</p></div>
        <button onClick={() => void loadOperations()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
      {message && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-300" role="status"><Check className="h-4 w-4" />{message}</div>}
      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-300" role="alert"><AlertCircle className="h-4 w-4" />{error}</div>}
      {loading ? <div className="flex min-h-[260px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div> : (
        <>
          <JobSection title="Object cleanup jobs" icon={Cloud} empty="No object cleanup jobs have been recorded." hasItems={cleanupJobs.length > 0}>
            {cleanupJobs.map((job) => (
              <div key={job.id} className="grid gap-3 border-b border-slate-800 px-5 py-4 last:border-0 lg:grid-cols-[1fr_150px_100px_140px] lg:items-center">
                <div className="min-w-0"><p className="truncate font-mono text-xs text-slate-300" title={job.storage_key}>{job.storage_key}</p><p className="mt-1 text-xs text-slate-500">{job.reason} · {job.storage_provider.toUpperCase()}</p></div>
                <Status value={job.status} /><div className="text-xs text-slate-500">{job.attempts} attempts</div>
                <button onClick={() => void retryCleanup(job)} disabled={busyId === job.id || job.status === 'completed'} className="rounded-lg border border-indigo-700/50 bg-indigo-950/30 px-3 py-2 text-xs text-indigo-300 disabled:opacity-40">{busyId === job.id ? 'Working…' : job.status === 'completed' ? 'Completed' : 'Retry delete'}</button>
              </div>
            ))}
          </JobSection>
          <JobSection title="AI processing jobs" icon={Sparkles} empty="No queued or failed AI jobs." hasItems={aiJobs.length > 0}>
            {aiJobs.map((job) => (
              <div key={job.id} className="grid gap-3 border-b border-slate-800 px-5 py-4 last:border-0 lg:grid-cols-[1fr_150px_130px_140px] lg:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{resourceTitle(job)}</p><p className="mt-1 text-xs text-slate-500">{job.last_error_code || 'No sanitized error code'}</p></div>
                <Status value={job.status} /><div className="text-xs text-slate-500">{job.attempts} / {job.max_attempts} attempts</div>
                <button onClick={() => void retryAi(job)} disabled={busyId === job.id || job.status !== 'failed' || job.attempts >= job.max_attempts} className="rounded-lg border border-purple-700/50 bg-purple-950/30 px-3 py-2 text-xs text-purple-300 disabled:opacity-40">{busyId === job.id ? 'Working…' : 'Queue retry'}</button>
              </div>
            ))}
          </JobSection>
        </>
      )}
    </div>
  );
}

function JobSection({ title, icon: Icon, empty, hasItems, children }: { title: string; icon: typeof Cloud; empty: string; hasItems: boolean; children: React.ReactNode }) {
  return <section className="admin-card overflow-hidden p-0"><div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4"><Icon className="h-5 w-5 text-indigo-400" /><h2 className="font-bold text-white">{title}</h2></div>{hasItems ? children : <p className="px-5 py-10 text-center text-sm text-slate-500">{empty}</p>}</section>;
}

function Status({ value }: { value: string }) {
  const style = value === 'completed' ? 'bg-emerald-500/10 text-emerald-300' : value === 'failed' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300';
  return <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style}`}>{value}</span>;
}
