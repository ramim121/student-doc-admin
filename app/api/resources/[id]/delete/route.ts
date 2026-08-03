import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteR2Object } from '@/lib/cloudflare-r2';
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

  const { data: cleanupJobId, error: requestError } = await supabase.rpc('request_resource_permanent_deletion', {
    resource_id: id,
    reason: parsed.data.reason,
    operation_request_id: requestId,
  });
  if (requestError) return response(409, { error: { code: 'DELETION_NOT_REQUESTED', message: requestError.message } }, requestId);
  if (!cleanupJobId) return response(200, { status: 'deleted', cleanup: 'not_required' }, requestId);

  const { data: job, error: jobError } = await supabase
    .from('storage_cleanup_jobs')
    .select('id, storage_key')
    .eq('id', cleanupJobId)
    .maybeSingle();
  if (jobError || !job) return response(202, { status: 'removed', cleanup: 'queued' }, requestId);

  let succeeded = false;
  try {
    await deleteR2Object(job.storage_key);
    succeeded = true;
  } catch {
    // The tracked job stays retryable and is visible on the Operations page.
  }
  const { error: resultError } = await supabase.rpc('admin_record_cleanup_result', {
    cleanup_job_id: job.id,
    succeeded,
    error_code: succeeded ? null : 'r2_delete_failed',
    operation_request_id: requestId,
  });
  if (resultError) {
    console.error('resource.delete.result_failed', { requestId, code: resultError.code });
    return response(202, { status: 'removed', cleanup: 'queued' }, requestId);
  }
  if (!succeeded) return response(202, { status: 'removed', cleanup: 'failed_retryable' }, requestId);
  return response(200, { status: 'deleted', cleanup: 'completed' }, requestId);
}
