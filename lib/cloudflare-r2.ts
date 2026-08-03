import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
