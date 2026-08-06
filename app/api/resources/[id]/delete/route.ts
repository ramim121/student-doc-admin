import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { permanentlyDeleteResource } from '@/lib/delete-resource';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isTrustedAdminMutationOrigin } from '@/lib/request-security';

const idSchema = z.string().uuid();
const bodySchema = z.object({ reason: z.string().trim().min(3).max(500) });

function response(status: number, body: Record<string, unknown>, requestId: string) {
  return NextResponse.json(
    { ...body, requestId },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  if (!isTrustedAdminMutationOrigin(request)) return response(403, { error: { code: 'UNTRUSTED_ORIGIN', message: 'The request origin is not allowed.' } }, requestId);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return response(400, { error: { code: 'INVALID_RESOURCE', message: 'Resource identifier is invalid.' } }, requestId);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response(400, { error: { code: 'INVALID_REASON', message: 'A deletion reason is required.' } }, requestId);

  const supabase = await createServerSupabaseClient();
  const [{ data: { user } }, { data: isAdmin }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('is_admin'),
  ]);
  if (!user) return response(401, { error: { code: 'AUTH_REQUIRED', message: 'Administrator sign-in is required.' } }, requestId);
  if (isAdmin !== true) return response(403, { error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } }, requestId);

  const result = await permanentlyDeleteResource(supabase, id, parsed.data.reason, requestId);

  switch (result.outcome) {
    case 'refused':
      return response(409, { error: { code: 'DELETION_NOT_REQUESTED', message: result.message } }, requestId);
    case 'cleanup_queued':
      return response(202, { status: 'removed', cleanup: 'queued' }, requestId);
    case 'cleanup_failed':
      return response(202, { status: 'removed', cleanup: 'failed_retryable' }, requestId);
    default:
      return response(200, { status: 'deleted', cleanup: 'completed' }, requestId);
  }
}
