import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteR2Object } from '@/lib/cloudflare-r2';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isTrustedAdminMutationOrigin } from '@/lib/request-security';

const idSchema = z.string().uuid();

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
  if (!idSchema.safeParse(id).success) {
    return response(400, { error: { code: 'INVALID_JOB', message: 'Cleanup job identifier is invalid.' } }, requestId);
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: { user } }, { data: isAdmin }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('is_admin'),
  ]);
  if (!user) return response(401, { error: { code: 'AUTH_REQUIRED', message: 'Administrator sign-in is required.' } }, requestId);
  if (isAdmin !== true) return response(403, { error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } }, requestId);

  const { data: job, error: jobError } = await supabase
    .from('storage_cleanup_jobs')
    .select('id, storage_key, status')
    .eq('id', id)
    .maybeSingle();
  if (jobError || !job) return response(404, { error: { code: 'JOB_NOT_FOUND', message: 'Cleanup job was not found.' } }, requestId);
  if (job.status === 'completed') return response(200, { status: 'completed', idempotent: true }, requestId);

  let succeeded = false;
  let errorCode: string | null = null;
  try {
    await deleteR2Object(job.storage_key);
    succeeded = true;
  } catch {
    errorCode = 'r2_delete_failed';
  }

  const { error: recordError } = await supabase.rpc('admin_record_cleanup_result', {
    cleanup_job_id: job.id,
    succeeded,
    error_code: errorCode,
    operation_request_id: requestId,
  });
  if (recordError) {
    console.error('cleanup.result.failed', { requestId, code: recordError.code });
    return response(500, { error: { code: 'RESULT_NOT_RECORDED', message: 'Cleanup ran but its result could not be recorded.' } }, requestId);
  }
  if (!succeeded) return response(502, { error: { code: 'R2_DELETE_FAILED', message: 'Cloudflare R2 deletion failed and the job remains retryable.' } }, requestId);
  return response(200, { status: 'completed', idempotent: false }, requestId);
}
