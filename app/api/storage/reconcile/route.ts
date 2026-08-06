import { type NextRequest, NextResponse } from 'next/server';
import { listR2Objects } from '@/lib/cloudflare-r2';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * Compares what is actually in the bucket against what the database thinks is
 * stored. Two mismatches matter and neither is visible anywhere else:
 *
 *   orphaned  - an object with no resources row pointing at it. It costs
 *               storage forever and nothing in the app can reach or delete it.
 *   missing   - a row whose object is not in the bucket, so every download of
 *               that document fails.
 *
 * Read-only by design. It reports; deleting stays with the audited routes.
 */

/** Enough pages to walk a large bucket, but bounded so the request always ends. */
const MAX_PAGES = 20;

function response(status: number, body: Record<string, unknown>, requestId: string) {
  return NextResponse.json(
    { ...body, requestId },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  );
}

export async function GET(_request: NextRequest) {
  const requestId = crypto.randomUUID();

  const supabase = await createServerSupabaseClient();
  const [{ data: { user } }, { data: isAdmin }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('is_admin'),
  ]);
  if (!user) return response(401, { error: { code: 'AUTH_REQUIRED', message: 'Administrator sign-in is required.' } }, requestId);
  if (isAdmin !== true) return response(403, { error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } }, requestId);

  let objects: Array<{ key: string; size: number; lastModified: string | null }> = [];
  let token: string | undefined;
  let pages = 0;
  let truncated = false;

  try {
    do {
      const page = await listR2Objects({ continuationToken: token });
      objects = objects.concat(page.objects);
      token = page.nextToken ?? undefined;
      pages += 1;
      if (token && pages >= MAX_PAGES) {
        // Say so rather than presenting a partial scan as complete.
        truncated = true;
        break;
      }
    } while (token);
  } catch (error) {
    return response(502, {
      error: {
        code: 'BUCKET_UNREADABLE',
        message: error instanceof Error ? error.message : 'The bucket could not be listed.',
      },
    }, requestId);
  }

  const { data: rows, error: rowsError } = await supabase
    .from('resources')
    .select('id, title, status, storage_key, size_bytes')
    .eq('storage_provider', 'r2')
    .not('storage_key', 'is', null);
  if (rowsError) {
    return response(500, { error: { code: 'ROWS_UNREADABLE', message: rowsError.message } }, requestId);
  }

  const byKey = new Map((rows ?? []).map((row) => [row.storage_key as string, row]));
  const bucketKeys = new Set(objects.map((entry) => entry.key));

  const orphaned = objects
    .filter((entry) => !byKey.has(entry.key))
    .map((entry) => ({ key: entry.key, size: entry.size, lastModified: entry.lastModified }));

  // Only meaningful on a complete scan: a truncated listing would report every
  // unseen key as missing.
  const missing = truncated
    ? []
    : (rows ?? [])
        .filter((row) => !bucketKeys.has(row.storage_key as string))
        .map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          storageKey: row.storage_key,
        }));

  return response(200, {
    scannedAt: new Date().toISOString(),
    truncated,
    bucket: {
      objectCount: objects.length,
      totalBytes: objects.reduce((sum, entry) => sum + entry.size, 0),
    },
    database: { rowCount: rows?.length ?? 0 },
    matched: objects.length - orphaned.length,
    orphaned,
    missing,
  }, requestId);
}
