import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BookOpen,
  Building2,
  FileCheck,
  HardDrive,
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
    // Column on phones, sidebar from lg. A fixed 16rem rail left roughly 100px
    // of content on a 360px screen.
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col justify-between border-b border-slate-800 bg-[#0c121e] p-4 lg:w-64 lg:border-b-0 lg:border-r lg:p-6">
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

          {/* Horizontally scrollable strip on phones, stacked list from lg. */}
          <nav
            className="mt-4 flex gap-1 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:space-y-1 lg:overflow-visible lg:pb-0"
            aria-label="Admin navigation"
          >
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
            <Link href="/documents" className="admin-nav-link">
              <HardDrive className="h-4 w-4" />
              All Documents
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

      {/* min-w-0 lets wide tables scroll inside their own wrapper instead of
          stretching the flex row and scrolling the whole page sideways. */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
