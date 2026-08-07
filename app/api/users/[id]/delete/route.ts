import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { permanentlyDeleteResource } from '@/lib/delete-resource';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isTrustedAdminMutationOrigin } from '@/lib/request-security';

/**
 * Really deletes an account, rather than flagging it.
 *
 * The old flow only set account_status='deleted'. That blocks sign-in and every
 * mutation but leaves the row, so the email stays occupied and the person still
 * appears in listings - and behind a single confirm it is easy to hit by
 * mistake, which is exactly what happened to the project owner's own account.
 *
 * Everything runs through SECURITY DEFINER RPCs on the admin's own session, so
 * this console still needs no service-role key. Documents are removed first
 * because resources.uploader_id is ON DELETE NO ACTION - and they go through the
 * audited two-phase path so their files leave R2 instead of being orphaned.
 */

const idSchema = z.string().uuid();

/** One request removes at most this many documents; the UI re-runs for the rest. */
const MAX_DOCUMENTS_PER_REQUEST = 50;

const AUDIT_REASON = 'Account deleted from the admin console';

function response(status: number, body: Record<string, unknown>, requestId: string) {
  return NextResponse.json(
    { ...body, requestId },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  );
}

/** What deleting this account would destroy. Read-only. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return response(400, { error: { code: 'INVALID_USER', message: 'User identifier is invalid.' } }, requestId);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('preflight_user_delete', { p_user_id: id });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
    return response(status, { error: { code: 'PREFLIGHT_FAILED', message: error.message } }, requestId);
  }
  return response(200, { preflight: data }, requestId);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  if (!isTrustedAdminMutationOrigin(request)) {
    return response(403, { error: { code: 'UNTRUSTED_ORIGIN', message: 'The request origin is not allowed.' } }, requestId);
  }
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return response(400, { error: { code: 'INVALID_USER', message: 'User identifier is invalid.' } }, requestId);
  }

  const supabase = await createServerSupabaseClient();

  // Preflight doubles as the authorisation and existence check.
  const { data: preflight, error: preflightError } = await supabase.rpc('preflight_user_delete', { p_user_id: id });
  if (preflightError) {
    const status = preflightError.code === '42501' ? 403 : preflightError.code === 'P0002' ? 404 : 400;
    return response(status, { error: { code: 'PREFLIGHT_FAILED', message: preflightError.message } }, requestId);
  }
  const summary = preflight as { uploads: number; isSelf: boolean; email: string };
  if (summary.isSelf) {
    return response(409, { error: { code: 'CANNOT_DELETE_SELF', message: 'You cannot delete the account you are signed in with.' } }, requestId);
  }

  const { data: owned, error: ownedError } = await supabase
    .from('resources')
    .select('id, title')
    .eq('uploader_id', id)
    .order('created_at')
    .limit(MAX_DOCUMENTS_PER_REQUEST);
  if (ownedError) {
    return response(500, { error: { code: 'DOCUMENT_LOOKUP_FAILED', message: ownedError.message } }, requestId);
  }

  const documents: Array<{ id: string; title: string; outcome: string; message?: string }> = [];
  for (const doc of owned ?? []) {
    // Sequential: each pass deletes an R2 object and writes audit rows, and a
    // burst of parallel deletes makes a partial failure unreadable.
    const result = await permanentlyDeleteResource(supabase, doc.id, AUDIT_REASON, requestId);
    documents.push({ id: doc.id, title: doc.title, outcome: result.outcome, message: result.message });
  }

  const deleted = documents.filter((d) => d.outcome === 'deleted').length;
  const remaining = Math.max(0, (summary.uploads ?? 0) - deleted);

  // The account cannot go while a document still points at it.
  if (remaining > 0) {
    const failed = documents.filter((d) => d.outcome !== 'deleted');
    return response(202, {
      status: 'partial',
      deletedDocuments: deleted,
      remaining,
      documents,
      message: failed.length
        ? `${deleted} document(s) removed. ${failed.length} could not be, so the account was kept.`
        : `${deleted} document(s) removed. ${remaining} still to go - run delete again to continue.`,
    }, requestId);
  }

  const { error: deleteError } = await supabase.rpc('delete_user_admin', {
    p_user_id: id,
    p_request_id: requestId,
  });
  if (deleteError) {
    return response(409, {
      status: 'documents_deleted_account_kept',
      deletedDocuments: deleted,
      error: { code: 'ACCOUNT_DELETE_FAILED', message: deleteError.message },
    }, requestId);
  }

  return response(200, {
    status: 'deleted',
    email: summary.email,
    deletedDocuments: deleted,
  }, requestId);
}
