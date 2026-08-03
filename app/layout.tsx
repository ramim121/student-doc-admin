import './globals.css';
import Link from 'next/link';
import { Building2, BookOpen, FileCheck, Users, ShieldCheck, LayoutDashboard } from 'lucide-react';

export const metadata = {
  title: 'STUDYDOCK Admin Dashboard',
  description: 'Admin portal for managing universities, courses, content curation, and data merging.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-[#090d16] text-slate-100">
        {/* Admin Navigation Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-[#0c121e] p-6 shrink-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 px-2 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 font-bold text-white shadow-lg">
                SD
              </div>
              <div>
                <h1 className="font-bold text-base text-white">STUDYDOCK</h1>
                <span className="text-xs text-indigo-400 font-medium">Admin Backend</span>
              </div>
            </div>

            <nav className="mt-8 space-y-1">
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
              <Link href="/resources" className="admin-nav-link">
                <FileCheck className="h-4 w-4" />
                Resource Moderation
              </Link>
            </nav>
          </div>

          <div className="rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-4 text-xs text-slate-400">
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <ShieldCheck className="h-4 w-4" />
              RBAC Protected
            </div>
            <p className="mt-1">Atomic SQL Stored Procedures Enabled.</p>
          </div>
        </aside>

        {/* Main Admin Content View */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </body>
    </html>
  );
}
