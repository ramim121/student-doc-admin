import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getSafeRedirectPath } from '@/lib/safe-redirect';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = getSafeRedirectPath(request.nextUrl.searchParams.get('next'), '/');

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('error', 'The sign-in link is invalid or expired.');
  return NextResponse.redirect(loginUrl);
}
