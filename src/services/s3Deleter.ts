import * as AWS from 'aws-sdk';

function parseS3Url(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url);
    // path-style or virtual-hosted style
    // virtual hosted: https://bucket.s3.region.amazonaws.com/key
    const hostParts = u.hostname.split('.');
    const isVirtualHosted = hostParts.length >= 3 && hostParts[1] === 's3';
    if (isVirtualHosted) {
      const bucket = hostParts[0];
      const key = u.pathname.replace(/^\//, '');
      if (!bucket || !key) return null;
      return { bucket, key };
    }

    // path-style: https://s3.region.amazonaws.com/bucket/key
    if (u.hostname.startsWith('s3')) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const bucket = parts[0];
      const key = parts.slice(1).join('/');
      return { bucket, key };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function deleteFromS3ByUrl(url: string): Promise<void> {
  const parsed = parseS3Url(url);
  if (!parsed) {
    throw new Error('Could not parse S3 URL');
  }

  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
  });

  await s3
    .deleteObject({
      Bucket: parsed.bucket,
      Key: parsed.key,
    })
    .promise();
}


