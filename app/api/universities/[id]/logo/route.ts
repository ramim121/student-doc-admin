import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteR2Object, putR2Object } from '@/lib/cloudflare-r2';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isTrustedAdminMutationOrigin } from '@/lib/request-security';

/**
 * Uploads and removes an institution logo.
 *
 * The bytes land in R2 under a branding/ prefix and the row keeps only the key;
 * the portal streams the image from its own route. set_university_logo_admin
 * returns the key it replaced, which is then deleted - otherwise every reupload
 * would leave the old file in the bucket forever.
 */

const idSchema = z.string().uuid();

/** Logos are small. This cap is what stops the bucket filling with artwork. */
const MAX_BYTES = 1024 * 1024;

/**
 * SVG is deliberately absent: it can carry script, and these are served from
 * the portal's own origin.
 */
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function response(status: number, body: Record<string, unknown>, requestId: string) {
  return NextResponse.json(
    { ...body, requestId },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  );
}

async function requireAdmin(request: NextRequest, requestId: string) {
  if (!isTrustedAdminMutationOrigin(request)) {
    return { error: response(403, { error: { code: 'UNTRUSTED_ORIGIN', message: 'The request origin is not allowed.' } }, requestId) };
  }
  const supabase = await createServerSupabaseClient();
  const [{ data: { user } }, { data: isAdmin }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('is_admin'),
  ]);
  if (!user) return { error: response(401, { error: { code: 'AUTH_REQUIRED', message: 'Administrator sign-in is required.' } }, requestId) };
  if (isAdmin !== true) return { error: response(403, { error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } }, requestId) };
  return { supabase };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return response(400, { error: { code: 'INVALID_UNIVERSITY', message: 'Institution identifier is invalid.' } }, requestId);
  }

  const gate = await requireAdmin(request, requestId);
  if (gate.error) return gate.error;
  const supabase = gate.supabase!;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return response(400, { error: { code: 'NO_FILE', message: 'Attach a PNG, JPEG or WebP image.' } }, requestId);
  }

  const extension = ALLOWED[file.type];
  if (!extension) {
    return response(415, { error: { code: 'UNSUPPORTED_TYPE', message: 'Use a PNG, JPEG or WebP image.' } }, requestId);
  }
  if (file.size > MAX_BYTES) {
    return response(413, { error: { code: 'TOO_LARGE', message: 'Logos must be 1 MB or smaller.' } }, requestId);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `branding/universities/${id}/${crypto.randomUUID()}.${extension}`;

  try {
    await putR2Object(key, bytes, file.type);
  } catch (error) {
    return response(502, {
      error: { code: 'UPLOAD_FAILED', message: error instanceof Error ? error.message : 'The logo could not be stored.' },
    }, requestId);
  }

  const { data: previousKey, error: rpcError } = await supabase.rpc('set_university_logo_admin', {
    p_university_id: id,
    p_logo_key: key,
    p_request_id: requestId,
  });

  if (rpcError) {
    // The row was not updated, so nothing points at the object just written.
    await deleteR2Object(key).catch(() => {});
    return response(409, { error: { code: 'LOGO_NOT_SET', message: rpcError.message } }, requestId);
  }

  if (previousKey && previousKey !== key) {
    await deleteR2Object(previousKey as string).catch(() => {});
  }

  return response(200, { status: 'updated' }, requestId);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return response(400, { error: { code: 'INVALID_UNIVERSITY', message: 'Institution identifier is invalid.' } }, requestId);
  }

  const gate = await requireAdmin(request, requestId);
  if (gate.error) return gate.error;
  const supabase = gate.supabase!;

  const { data: previousKey, error: rpcError } = await supabase.rpc('set_university_logo_admin', {
    p_university_id: id,
    p_logo_key: null,
    p_request_id: requestId,
  });
  if (rpcError) {
    return response(409, { error: { code: 'LOGO_NOT_CLEARED', message: rpcError.message } }, requestId);
  }

  if (previousKey) await deleteR2Object(previousKey as string).catch(() => {});
  return response(200, { status: 'removed' }, requestId);
}
