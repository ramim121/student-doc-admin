import type { createServerSupabaseClient } from '@/lib/supabase-server';

type AdminSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Permanently deleting a resource is two-phase on purpose: the database marks
 * the row removed and books a storage_cleanup_job, the object is deleted from
 * R2, and only a recorded success drops the row. storage_cleanup_jobs.resource_id
 * is ON DELETE NO ACTION, so the row genuinely cannot disappear while its object
 * is still out there.
 *
 * That sequence lived inline in the single-resource route. Force-deleting a
 * course has to delete resources too, and doing it any other way - a plain
 * DELETE in SQL - would drop the row while leaving the file in the bucket
 * forever. Both callers share this function so neither can drift.
 */

export type ResourceDeletionOutcome =
  /** Row and stored object are both gone. */
  | 'deleted'
  /** R2 refused; the row survives and the job stays retryable on Operations. */
  | 'cleanup_failed'
  /** Object handled but the result could not be recorded; job stays retryable. */
  | 'cleanup_queued'
  /** The database declined the request (message carries the reason). */
  | 'refused';

export type ResourceDeletionResult = {
  resourceId: string;
  outcome: ResourceDeletionOutcome;
  /** Only true when the resources row is actually gone. */
  rowRemoved: boolean;
  message?: string;
};

export async function permanentlyDeleteResource(
  supabase: AdminSupabaseClient,
  resourceId: string,
  reason: string,
  requestId: string,
  /**
   * Injectable so tests can exercise the failure branches without touching R2.
   * Imported lazily because cloudflare-r2 pulls in `server-only`, which only
   * Next's bundler can resolve - a static import makes this module unloadable
   * under the plain node test runner.
   */
  deleteObject: (storageKey: string) => Promise<unknown> = async (storageKey) => {
    const { deleteR2Object } = await import('@/lib/cloudflare-r2');
    return deleteR2Object(storageKey);
  },
): Promise<ResourceDeletionResult> {
  const { data: cleanupJobId, error: requestError } = await supabase.rpc(
    'request_resource_permanent_deletion',
    { resource_id: resourceId, reason, operation_request_id: requestId },
  );

  if (requestError) {
    return {
      resourceId,
      outcome: 'refused',
      rowRemoved: false,
      message: requestError.message,
    };
  }

  // No cleanup job means there was no stored object, so the RPC already
  // deleted the row outright (or the resource was already gone).
  if (!cleanupJobId) {
    return { resourceId, outcome: 'deleted', rowRemoved: true };
  }

  const { data: job, error: jobError } = await supabase
    .from('storage_cleanup_jobs')
    .select('id, storage_key')
    .eq('id', cleanupJobId)
    .maybeSingle();

  if (jobError || !job) {
    return {
      resourceId,
      outcome: 'cleanup_queued',
      rowRemoved: false,
      message: 'The cleanup job could not be read back; it stays queued on Operations.',
    };
  }

  let succeeded = false;
  try {
    await deleteObject(job.storage_key);
    succeeded = true;
  } catch {
    // Left retryable on purpose - Operations owns the retry.
  }

  const { error: resultError } = await supabase.rpc('admin_record_cleanup_result', {
    cleanup_job_id: job.id,
    succeeded,
    error_code: succeeded ? null : 'r2_delete_failed',
    operation_request_id: requestId,
  });

  if (resultError) {
    return {
      resourceId,
      outcome: 'cleanup_queued',
      rowRemoved: false,
      message: resultError.message,
    };
  }

  if (!succeeded) {
    return {
      resourceId,
      outcome: 'cleanup_failed',
      rowRemoved: false,
      message: 'The stored file could not be deleted, so the record was kept.',
    };
  }

  return { resourceId, outcome: 'deleted', rowRemoved: true };
}
