'use client';

import { useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Password change for the signed-in administrator.
 *
 * updateUser() will change the password on the strength of the session cookie
 * alone, so the current password is verified first. Without that, anyone who
 * reached an unlocked browser could lock the real admin out of the console.
 */
export default function AdminAccountPage() {
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaved(false);

    if (password.length < 12) {
      // Longer than the portal's 8: this account can delete every document.
      setError('Use at least 12 characters for an administrator password.');
      return;
    }
    if (password !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    if (password === currentPassword) {
      setError('The new password must differ from the current one.');
      return;
    }

    setBusy(true);

    // Re-authenticate rather than trusting the session.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      setBusy(false);
      setError('The current password is incorrect.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message || 'The password could not be changed.');
      return;
    }

    setCurrentPassword('');
    setPassword('');
    setConfirmation('');
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Security</h1>
        <p className="mt-1 text-sm text-slate-400">
          Change the password for your administrator sign-in.
        </p>
      </div>

      <section className="admin-card max-w-lg">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-indigo-400" />
          <h2 className="font-semibold text-white">Change password</h2>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-3 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-300" />
          <span>
            Signed in as <span className="font-semibold text-white">{email || '…'}</span>
          </span>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-300">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="admin-input mt-1.5 w-full"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-300">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="admin-input mt-1.5 w-full"
              required
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              At least 12 characters.
            </span>
          </label>
          <label className="block text-sm font-semibold text-slate-300">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="admin-input mt-1.5 w-full"
              required
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-sm text-rose-400">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-400">
              <Check className="h-4 w-4" />
              Password changed. Use it the next time you sign in.
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
