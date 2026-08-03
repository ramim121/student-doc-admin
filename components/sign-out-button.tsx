'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={signOut}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}
