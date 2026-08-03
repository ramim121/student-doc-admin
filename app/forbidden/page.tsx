'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldX } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ForbiddenPage() {
  const router = useRouter();
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000';

  const useAnotherAccount = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090d16] px-4">
      <section className="w-full max-w-lg rounded-3xl border border-rose-900/40 bg-slate-950 p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <ShieldX className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Administrator access required</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          You are signed in, but this profile does not have permission to use the STUDYDOCK Admin App.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={useAnotherAccount} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
            Use another account
          </button>
          <Link href={portalUrl} className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-900">
            Return to portal
          </Link>
        </div>
      </section>
    </main>
  );
}
