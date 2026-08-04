import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BookOpen,
  Building2,
  FileCheck,
  LayoutDashboard,
  ShieldCheck,
  Tag,
  Users,
  Wrench,
} from 'lucide-react';
import { SignOutButton } from '@/components/sign-out-button';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: profile }, { data: role }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.rpc('get_my_role'),
  ]);

  if (role !== 'admin') redirect('/forbidden');

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col justify-between border-r border-slate-800 bg-[#0c121e] p-6">
        <div>
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 font-bold text-white shadow-lg">
              SD
            </div>
            <div>
              <h1 className="text-base font-bold text-white">STUDYDOCK</h1>
              <span className="text-xs font-medium text-indigo-400">Admin Backend</span>
            </div>
          </div>

          <nav className="mt-8 space-y-1" aria-label="Admin navigation">
            <Link href="/" className="admin-nav-link">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard Overview
            </Link>
            <Link href="/universities" className="admin-nav-link">
              <Building2 className="h-4 w-4" />
              University Merge & Clean
            </Link>
            <Link href="/courses" className="admin-nav-link">
              <BookOpen className="h-4 w-4" />
              Course & Short Codes
            </Link>
            <Link href="/categories" className="admin-nav-link">
              <Tag className="h-4 w-4" />
              Document Categories
            </Link>
            <Link href="/resources" className="admin-nav-link">
              <FileCheck className="h-4 w-4" />
              Resource Moderation
            </Link>
            <Link href="/users" className="admin-nav-link">
              <Users className="h-4 w-4" />
              Users & Roles
            </Link>
            <Link href="/operations" className="admin-nav-link">
              <Wrench className="h-4 w-4" />
              Operational Recovery
            </Link>
          </nav>
        </div>

        <div>
          <div className="rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-4 text-xs text-slate-400">
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <ShieldCheck className="h-4 w-4" />
              Admin verified
            </div>
            <p className="mt-1 truncate" title={user.email || undefined}>
              {profile?.full_name || user.email || 'Administrator'}
            </p>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
