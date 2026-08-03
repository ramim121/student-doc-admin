'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FileCheck, Trash2, ExternalLink, Sparkles, Loader2 } from 'lucide-react';

interface ResourceItem {
  id: string;
  title: string;
  description: string;
  course_code: string;
  storage_provider: string;
  ai_summary: string;
  created_at: string;
}

export default function ResourceModerationAdminPage() {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('resources')
      .select('id, title, description, course_code, storage_provider, ai_summary, created_at')
      .order('created_at', { ascending: false });
    if (data) setResources(data as ResourceItem[]);
    setLoading(false);
  };

  const handleDeleteResource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this resource record?')) return;
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (!error) {
      setResources((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resource Curation & Moderation</h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspect uploaded materials, review Cloudflare R2 storage keys, and verify Gemini AI executive summaries.
        </p>
      </div>

      <div className="admin-card overflow-hidden p-0">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-6 py-4">Title</th>
              <th className="px-6 py-4">Course Code</th>
              <th className="px-6 py-4">Storage</th>
              <th className="px-6 py-4">Gemini AI Summary</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-400" />
                  Loading resources...
                </td>
              </tr>
            ) : resources.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No resources found in database.
                </td>
              </tr>
            ) : (
              resources.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-6 py-4 font-semibold text-white max-w-xs truncate">{r.title}</td>
                  <td className="px-6 py-4 font-mono text-xs text-indigo-400">{r.course_code || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-mono font-bold text-emerald-400 border border-emerald-500/20">
                      {r.storage_provider ? r.storage_provider.toUpperCase() : 'R2'}
                    </span>
                  </td>
                  <td className="px-6 py-4 max-w-sm text-xs text-slate-400 line-clamp-2">
                    {r.ai_summary ? (
                      <span className="flex items-start gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                        {r.ai_summary}
                      </span>
                    ) : (
                      'No AI summary generated'
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeleteResource(r.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-900/50"
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
    </div>
  );
}
