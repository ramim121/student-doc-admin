import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = ['/login', '/forbidden', '/auth/callback'];

function copyAuthState(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  for (const header of ['cache-control', 'expires', 'pragma']) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }
  return target;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: 'Admin authentication is not configured.' },
      { status: 503 },
    );
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isPublicPath = publicPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  );

  if (!user) {
    if (isPublicPath) return response;

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return copyAuthState(response, NextResponse.redirect(loginUrl));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin';

  if (!isAdmin && request.nextUrl.pathname !== '/forbidden') {
    const forbiddenUrl = request.nextUrl.clone();
    forbiddenUrl.pathname = '/forbidden';
    forbiddenUrl.search = '';
    return copyAuthState(response, NextResponse.redirect(forbiddenUrl));
  }

  if (isAdmin && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/forbidden')) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/';
    dashboardUrl.search = '';
    return copyAuthState(response, NextResponse.redirect(dashboardUrl));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
