import 'server-only';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Cloudflare R2 server configuration is incomplete.');
  }
  return {
    bucketName,
    client: new S3Client({
      region: 'auto',
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export async function deleteR2Object(storageKey: string) {
  const { client, bucketName } = getR2Config();
  await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: storageKey }));
}

export type R2Object = {
  key: string;
  size: number;
  /** ISO-8601 UTC, or null when the provider omits it. */
  lastModified: string | null;
};

/**
 * One page of bucket contents. The caller loops on the returned token, so a
 * bucket larger than a single response is still walked in full rather than
 * silently truncated at 1000 keys.
 */
export async function listR2Objects(options: { continuationToken?: string; pageSize?: number } = {}) {
  const { client, bucketName } = getR2Config();
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: options.continuationToken,
      MaxKeys: Math.min(options.pageSize ?? 1000, 1000),
    }),
  );

  return {
    objects: (result.Contents ?? []).map((entry) => ({
      key: entry.Key ?? '',
      size: entry.Size ?? 0,
      lastModified: entry.LastModified ? entry.LastModified.toISOString() : null,
    })).filter((entry) => entry.key),
    nextToken: result.IsTruncated ? result.NextContinuationToken ?? null : null,
  };
}

export async function getR2ReviewDownloadUrl(storageKey: string, fileName: string) {
  const { client, bucketName } = getR2Config();
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'resource';
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
    ResponseContentType: 'application/octet-stream',
  }), { expiresIn: 300 });
}
