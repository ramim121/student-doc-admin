'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, BookOpen, FileText, AlertCircle, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    totalUniversities: 0,
    pendingUniversities: 0,
    totalCourses: 0,
    pendingCourses: 0,
    totalResources: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [{ count: uniCount }, { count: pendingUniCount }, { count: crsCount }, { count: pendingCrsCount }, { count: resCount }] =
          await Promise.all([
            supabase.from('universities').select('*', { count: 'exact', head: true }),
            supabase.from('universities').select('*', { count: 'exact', head: true }).eq('status', 'custom_pending'),
            supabase.from('courses').select('*', { count: 'exact', head: true }),
            supabase.from('courses').select('*', { count: 'exact', head: true }).eq('status', 'custom_pending'),
            supabase.from('resources').select('*', { count: 'exact', head: true }),
          ]);

        setStats({
          totalUniversities: uniCount || 0,
          pendingUniversities: pendingUniCount || 0,
          totalCourses: crsCount || 0,
          pendingCourses: pendingCrsCount || 0,
          totalResources: resCount || 0,
        });
      } catch (err) {
        console.error('Failed to load admin stats:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Overview Dashboard</h1>
        <p className="mt-1 text-slate-400">
          Manage system-wide universities, short course codes, content moderation, and atomic database merges.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-5 md:grid-cols-4">
        <div className="admin-card">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Universities</span>
            <Building2 className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{stats.totalUniversities}</div>
          <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {stats.pendingUniversities} pending user-added entries
          </div>
        </div>

        <div className="admin-card">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Courses & Codes</span>
            <BookOpen className="h-5 w-5 text-purple-400" />
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{stats.totalCourses}</div>
          <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {stats.pendingCourses} custom courses pending clean-up
          </div>
        </div>

        <div className="admin-card">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-sm font-medium">Resources Shared</span>
            <FileText className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{stats.totalResources}</div>
          <div className="mt-2 text-xs text-emerald-400">Stored on Cloudflare R2</div>
        </div>
      </div>

      {/* Quick Action Navigation */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="admin-card border-indigo-900/50 bg-slate-900/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-400" />
            University Management & Merging
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Merge user-created duplicate universities into canonical records via atomic PostgreSQL stored procedures (`merge_universities`).
          </p>
          <div className="mt-6">
            <Link
              href="/universities"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Open University Manager
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="admin-card border-purple-900/50 bg-slate-900/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-400" />
            Course Code & Title Curation
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Edit course codes (e.g. `ACC-401`, `FIN-435`), modify descriptions, and execute `merge_courses` stored procedure.
          </p>
          <div className="mt-6">
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition-colors"
            >
              Open Course Manager
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
