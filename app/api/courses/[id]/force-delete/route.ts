import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { permanentlyDeleteResource } from '@/lib/delete-resource';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isTrustedAdminMutationOrigin } from '@/lib/request-security';

/**
 * delete_course_admin refuses while any resource still points at the course,
 * which is the right default - merging keeps the documents. Force delete is the
 * deliberate opposite: destroy the documents, then the course.
 *
 * Each document goes through the same audited two-phase deletion the single
 * resource route uses, so every file leaves R2 and every removal is recorded
 * individually. A course delete that quietly orphaned files in the bucket would
 * be worse than the refusal it replaces.
 */

/** One request deletes at most this many documents; the UI re-runs for the rest. */
const MAX_DOCUMENTS_PER_REQUEST = 50;

const idSchema = z.string().uuid();
const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
  /** Typed confirmation - must equal the course code. */
  confirm: z.string().trim().min(1),
});

function response(status: number, body: Record<string, unknown>, requestId: string) {
  return NextResponse.json(
    { ...body, requestId },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  if (!isTrustedAdminMutationOrigin(request)) {
    return response(403, { error: { code: 'UNTRUSTED_ORIGIN', message: 'The request origin is not allowed.' } }, requestId);
  }
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return response(400, { error: { code: 'INVALID_COURSE', message: 'Course identifier is invalid.' } }, requestId);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return response(400, { error: { code: 'INVALID_REQUEST', message: 'A deletion reason and a typed confirmation are required.' } }, requestId);
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: { user } }, { data: isAdmin }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('is_admin'),
  ]);
  if (!user) return response(401, { error: { code: 'AUTH_REQUIRED', message: 'Administrator sign-in is required.' } }, requestId);
  if (isAdmin !== true) return response(403, { error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } }, requestId);

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, code, title')
    .eq('id', id)
    .maybeSingle();
  if (courseError) return response(500, { error: { code: 'COURSE_LOOKUP_FAILED', message: courseError.message } }, requestId);
  if (!course) return response(404, { error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' } }, requestId);

  // Checked server-side too: the client can be bypassed, and this is the last
  // gate before documents are destroyed.
  if (parsed.data.confirm !== course.code) {
    return response(400, { error: { code: 'CONFIRMATION_MISMATCH', message: `Type the course code ${course.code} to confirm.` } }, requestId);
  }

  const { count: totalLinked, error: countError } = await supabase
    .from('resources')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', id);
  if (countError) return response(500, { error: { code: 'BLOCKER_LOOKUP_FAILED', message: countError.message } }, requestId);

  const { data: blockers, error: blockerError } = await supabase
    .from('resources')
    .select('id, title')
    .eq('course_id', id)
    .order('created_at')
    .limit(MAX_DOCUMENTS_PER_REQUEST);
  if (blockerError) return response(500, { error: { code: 'BLOCKER_LOOKUP_FAILED', message: blockerError.message } }, requestId);

  const documents: Array<{ id: string; title: string; outcome: string; message?: string }> = [];
  for (const blocker of blockers ?? []) {
    // Sequential on purpose: each iteration deletes an object from R2 and
    // writes audit rows, and a burst of parallel deletes would make a partial
    // failure much harder to read back.
    const result = await permanentlyDeleteResource(supabase, blocker.id, parsed.data.reason, requestId);
    documents.push({
      id: blocker.id,
      title: blocker.title,
      outcome: result.outcome,
      message: result.message,
    });
  }

  const deletedCount = documents.filter((entry) => entry.outcome === 'deleted').length;
  const failed = documents.filter((entry) => entry.outcome !== 'deleted');
  const remaining = Math.max(0, (totalLinked ?? 0) - deletedCount);

  // Only attempt the course once nothing references it; otherwise the RPC would
  // just raise the same refusal and bury the per-document detail.
  if (remaining > 0) {
    return response(202, {
      status: 'partial',
      course: { id: course.id, code: course.code, title: course.title },
      deletedCount,
      remaining,
      documents,
      message:
        failed.length > 0
          ? `${deletedCount} document(s) deleted. ${failed.length} could not be removed, so the course was kept.`
          : `${deletedCount} document(s) deleted. ${remaining} still linked - run force delete again to continue.`,
    }, requestId);
  }

  const { error: deleteError } = await supabase.rpc('delete_course_admin', {
    p_course_id: id,
    p_reason: parsed.data.reason,
    p_request_id: requestId,
  });
  if (deleteError) {
    return response(409, {
      status: 'documents_deleted_course_kept',
      course: { id: course.id, code: course.code, title: course.title },
      deletedCount,
      documents,
      error: { code: 'COURSE_DELETE_FAILED', message: deleteError.message },
    }, requestId);
  }

  return response(200, {
    status: 'deleted',
    course: { id: course.id, code: course.code, title: course.title },
    deletedCount,
    remaining: 0,
    documents,
  }, requestId);
}
