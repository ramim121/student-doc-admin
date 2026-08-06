import assert from 'node:assert/strict';
import test from 'node:test';
import { permanentlyDeleteResource } from '../lib/delete-resource';

const JOB_ID = '00000000-0000-0000-0000-00000000cafe';
const STORAGE_KEY = 'resources/synthetic/example.pdf';
const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';

type RpcResult = { data: unknown; error: { message: string } | null };

/**
 * The real client is a long builder chain; only the calls this function makes
 * are modelled. Every rpc name it receives is recorded so a test can assert
 * that the cleanup result was actually reported back.
 */
function fakeSupabase(options: {
  requestResult?: RpcResult;
  job?: { id: string; storage_key: string } | null;
  jobError?: { message: string } | null;
  recordResult?: RpcResult;
}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'request_resource_permanent_deletion') {
        return Promise.resolve(options.requestResult ?? { data: JOB_ID, error: null });
      }
      if (name === 'admin_record_cleanup_result') {
        return Promise.resolve(options.recordResult ?? { data: null, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from() {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: options.job === undefined ? { id: JOB_ID, storage_key: STORAGE_KEY } : options.job,
                error: options.jobError ?? null,
              }),
          }),
        }),
      };
    },
  };
  return { client, calls };
}

const run = (client: unknown, deleteObject: (key: string) => Promise<unknown>) =>
  permanentlyDeleteResource(
    client as Parameters<typeof permanentlyDeleteResource>[0],
    RESOURCE_ID,
    'course force delete',
    'req-1',
    deleteObject,
  );

test('a refused request never touches storage', async () => {
  const { client, calls } = fakeSupabase({
    requestResult: { data: null, error: { message: 'Administrator access required.' } },
  });
  let called = false;
  const result = await run(client, async () => { called = true; });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.rowRemoved, false);
  assert.equal(result.message, 'Administrator access required.');
  assert.equal(called, false, 'must not delete from R2 when the database refused');
  assert.equal(calls.filter((call) => call.name === 'admin_record_cleanup_result').length, 0);
});

test('no cleanup job means the row was already dropped', async () => {
  // Resources with no stored object are deleted outright by the RPC.
  const { client } = fakeSupabase({ requestResult: { data: null, error: null } });
  const result = await run(client, async () => {
    throw new Error('should not be called');
  });

  assert.equal(result.outcome, 'deleted');
  assert.equal(result.rowRemoved, true);
});

test('the happy path deletes the object and reports success', async () => {
  const { client, calls } = fakeSupabase({});
  const deleted: string[] = [];
  const result = await run(client, async (key) => { deleted.push(key); });

  assert.equal(result.outcome, 'deleted');
  assert.equal(result.rowRemoved, true);
  assert.deepEqual(deleted, [STORAGE_KEY]);

  const record = calls.find((call) => call.name === 'admin_record_cleanup_result');
  assert.ok(record, 'the cleanup result must be recorded');
  assert.equal(record?.args.succeeded, true);
  assert.equal(record?.args.error_code, null);
});

test('an R2 failure keeps the row and marks the job retryable', async () => {
  const { client, calls } = fakeSupabase({});
  const result = await run(client, async () => {
    throw new Error('r2 unreachable');
  });

  // This is the case that matters for force delete: the course must not be
  // removed while a document it owns still has a file in the bucket.
  assert.equal(result.outcome, 'cleanup_failed');
  assert.equal(result.rowRemoved, false, 'the row must survive so the file is not orphaned');

  const record = calls.find((call) => call.name === 'admin_record_cleanup_result');
  assert.equal(record?.args.succeeded, false);
  assert.equal(record?.args.error_code, 'r2_delete_failed');
});

test('an unreadable cleanup job leaves the work queued', async () => {
  const { client } = fakeSupabase({ job: null });
  let called = false;
  const result = await run(client, async () => { called = true; });

  assert.equal(result.outcome, 'cleanup_queued');
  assert.equal(result.rowRemoved, false);
  assert.equal(called, false, 'without a storage key there is nothing to delete');
});

test('a failure to record the result is not reported as success', async () => {
  const { client } = fakeSupabase({
    recordResult: { data: null, error: { message: 'row level security' } },
  });
  const result = await run(client, async () => undefined);

  assert.equal(result.outcome, 'cleanup_queued');
  assert.equal(result.rowRemoved, false, 'the row is only gone once the RPC confirms it');
  assert.equal(result.message, 'row level security');
});
