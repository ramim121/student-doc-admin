import type { NextRequest } from 'next/server';

function originOf(value: string | null | undefined) {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

export function isTrustedAdminMutationOrigin(request: NextRequest) {
  const origin = originOf(request.headers.get('origin'));
  if (!origin) return false;
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  const allowed = new Set([
    originOf(process.env.NEXT_PUBLIC_ADMIN_SITE_URL),
    originOf(request.nextUrl.origin),
    originOf(forwardedHost ? `${protocol}://${forwardedHost}` : null),
    originOf(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null),
  ].filter((value): value is string => Boolean(value)));
  return allowed.has(origin);
}
