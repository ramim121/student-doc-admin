'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { supabase } from '@/lib/supabase';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeRedirectPath(searchParams.get('next'), '/');
  const callbackError = searchParams.get('error');
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError('The email or password is incorrect.');
      setLoading(false);
      return;
    }

    const { data: role, error: profileError } = await supabase.rpc('get_my_role');

    if (profileError || role !== 'admin') {
      router.replace('/forbidden');
      router.refresh();
      return;
    }

    router.replace(next);
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#172554,_#090d16_48%)] px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/90 p-8 shadow-2xl shadow-indigo-950/30">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 font-bold text-white shadow-lg">SD</div>
          <div>
            <h1 className="font-bold text-white">STUDYDOCK</h1>
            <p className="text-xs font-medium text-indigo-400">Restricted administration</p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-2xl font-bold text-white">Administrator sign in</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your authenticated profile must have the admin role.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="admin-email" className="mb-1.5 block text-sm font-semibold text-slate-200">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                required
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-4 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="admin@example.com"
              />
            </div>
          </div>
          <div>
            <label htmlFor="admin-password" className="mb-1.5 block text-sm font-semibold text-slate-200">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                required
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-4 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Password"
              />
            </div>
          </div>

          {(error || callbackError) && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
              {error || callbackError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 font-semibold text-white shadow-lg transition hover:from-indigo-500 hover:to-purple-500 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ShieldCheck className="mr-2 h-4 w-4" />Sign in<ArrowRight className="ml-2 h-4 w-4" /></>}
          </button>
        </form>

        <Link href={portalUrl} className="mt-6 block text-center text-sm text-slate-400 hover:text-indigo-300">
          Return to the student portal
        </Link>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
