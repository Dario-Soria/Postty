import * as AWS from 'aws-sdk';

const DEFAULT_REGION = process.env.AWS_REGION || 'us-east-1';

// Cache bucket -> region (to survive misconfigured AWS_REGION locally/ECS).
const bucketRegionCache = new Map<string, string>();
// Cache region -> S3 client
const s3ClientCache = new Map<string, AWS.S3>();

function normalizeLocationConstraint(loc: string | null | undefined): string {
  // AWS legacy: "EU" means eu-west-1
  if (!loc) return 'us-east-1';
  if (loc === 'EU') return 'eu-west-1';
  return loc;
}

function getS3ForRegion(region: string): AWS.S3 {
  const r = region || 'us-east-1';
  const cached = s3ClientCache.get(r);
  if (cached) return cached;
  // Force SigV4 (modern S3 requirement in most regions).
  const s3 = new AWS.S3({ region: r, signatureVersion: 'v4' });
  s3ClientCache.set(r, s3);
  return s3;
}

export async function getBucketRegion(bucket: string): Promise<string> {
  const b = (bucket || '').trim();
  if (!b) throw new Error('Missing S3 bucket name');
  const cached = bucketRegionCache.get(b);
  if (cached) return cached;

  // Use a "best effort" client; S3 will still answer getBucketLocation via global endpoints,
  // and if it redirects, AWS SDK typically attaches `region` on the error.
  const s3 = getS3ForRegion(DEFAULT_REGION);
  try {
    const res = await s3.getBucketLocation({ Bucket: b }).promise();
    const region = normalizeLocationConstraint(res.LocationConstraint as any);
    bucketRegionCache.set(b, region);
    return region;
  } catch (e: any) {
    const regionFromErr =
      typeof e?.region === 'string' && e.region.trim().length > 0 ? e.region.trim() : null;
    if (regionFromErr) {
      bucketRegionCache.set(b, regionFromErr);
      return regionFromErr;
    }
    throw e;
  }
}

export async function getS3ForBucket(bucket: string): Promise<AWS.S3> {
  const region = await getBucketRegion(bucket);
  return getS3ForRegion(region);
}

export async function getSignedGetObjectUrl(params: {
  bucket: string;
  key: string;
  expiresSeconds: number;
}): Promise<string> {
  const s3 = await getS3ForBucket(params.bucket);
  return s3.getSignedUrl('getObject', {
    Bucket: params.bucket,
    Key: params.key,
    Expires: Math.min(Math.max(params.expiresSeconds, 60), 7 * 24 * 60 * 60),
  });
}


