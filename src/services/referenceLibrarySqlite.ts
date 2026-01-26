import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import * as AWS from 'aws-sdk';
import { Pool } from 'pg';
import * as logger from '../utils/logger';
import { extractDesignGuidelinesWithGemini } from './geminiMultimodal';
import { getS3ForBucket, getSignedGetObjectUrl } from './s3Client';

type ReferenceScope = 'global' | 'user';

let _pool: Pool | null = null;

function normalizeDatabaseUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';

  // Neon Console often provides a convenience command like:
  //   psql 'postgresql://user:pass@host/db?sslmode=require'
  // Users sometimes paste that whole thing into .env.
  if (s.toLowerCase().startsWith('psql ')) {
    s = s.slice('psql '.length).trim();
  }

  // Strip wrapping quotes (single or double)
  if (
    (s.startsWith("'") && s.endsWith("'") && s.length > 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length > 2)
  ) {
    s = s.slice(1, -1).trim();
  }

  return s;
}

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = normalizeDatabaseUrl(
    process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || ''
  );
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL (Neon Postgres connection string)');
  }
  _pool = new Pool({ connectionString, max: 10 });
  return _pool;
}

let _schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reference_images (
      id uuid PRIMARY KEY,
      scope text NOT NULL CHECK (scope IN ('global','user')),
      owner_uid text NULL,
      sha256 text NOT NULL,
      original_filename text NOT NULL,
      s3_bucket text NOT NULL,
      s3_key text NOT NULL,
      mime text NOT NULL,
      bytes integer NOT NULL,
      width integer NULL,
      height integer NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      tags text[] NOT NULL DEFAULT ARRAY[]::text[],
      industry text NOT NULL DEFAULT '',
      aesthetic text NOT NULL DEFAULT '',
      mood text NOT NULL DEFAULT '',
      design_guidelines jsonb NOT NULL DEFAULT '{}'::jsonb,
      ranking integer NOT NULL DEFAULT 1
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reference_images_scope_owner_rank ON reference_images(scope, owner_uid, ranking DESC, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reference_images_sha_scope_owner ON reference_images(sha256, scope, owner_uid);`);
  _schemaReady = true;
}

function computeSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function ensureTempDir(): string {
  const dir = path.join(process.cwd(), 'temp-uploads', 'ref-lib');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getBucket(): string {
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket) throw new Error('AWS_BUCKET_NAME environment variable is not set');
  return bucket;
}

function safeFilename(raw: string): string {
  const base = (raw || 'upload').split('/').pop() || 'upload';
  return base.replace(/[^\w\-.]+/g, '_').slice(0, 140);
}

function s3KeyFor(params: { scope: ReferenceScope; ownerUid?: string | null; id: string; originalFilename: string }): string {
  const file = safeFilename(params.originalFilename);
  if (params.scope === 'global') return `references/global/${params.id}/${file}`;
  const uid = (params.ownerUid || '').trim();
  return `references/users/${uid}/${params.id}/${file}`;
}

async function signedGetUrl(params: { bucket: string; key: string; expiresSeconds: number }): Promise<string> {
  return await getSignedGetObjectUrl(params);
}

export type SavedReferenceImage = {
  id: string;
  s3_bucket: string;
  s3_key: string;
  sha256: string;
  scope: ReferenceScope;
  owner_uid: string | null;
};

/**
 * Save a reference image to S3, persist metadata in Neon Postgres, and index it asynchronously with Gemini.
 *
 * Defaults:
 * - If no ownerUid is provided, saves to the GLOBAL library.
 */
export async function saveReferenceImageAsync(params: {
  buffer: Buffer;
  originalFilename: string;
  mime: string;
  ownerUid?: string | null;
}): Promise<SavedReferenceImage | null> {
  await ensureSchema();
  const pool = getPool();

  const ownerUid = typeof params.ownerUid === 'string' && params.ownerUid.trim().length > 0 ? params.ownerUid.trim() : null;
  const scope: ReferenceScope = ownerUid ? 'user' : 'global';
  const sha256 = computeSha256(params.buffer);

  // Dedupe within scope+owner
  const existing = await pool.query(
    `SELECT id, s3_bucket, s3_key, sha256, scope, owner_uid, design_guidelines
     FROM reference_images
     WHERE sha256 = $1 AND scope = $2 AND (owner_uid IS NOT DISTINCT FROM $3)
     LIMIT 1`,
    [sha256, scope, ownerUid]
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const needsIndex = !row.design_guidelines || JSON.stringify(row.design_guidelines) === '{}' ;
    if (needsIndex) {
      setImmediate(() => {
        void (async () => {
          try {
            const tempDir = ensureTempDir();
            const ext = params.mime.includes('png') ? 'png' : params.mime.includes('webp') ? 'webp' : 'jpg';
            const tempPath = path.join(tempDir, `${Date.now()}_${row.id}.${ext}`);
            fs.writeFileSync(tempPath, params.buffer);
            const { tags, industry, aesthetic, mood, design_guidelines } = await extractDesignGuidelinesWithGemini({ imagePath: tempPath });
            await pool.query(
              `UPDATE reference_images
               SET tags = $1, industry = $2, aesthetic = $3, mood = $4, design_guidelines = $5
               WHERE id = $6`,
              [tags, industry || '', aesthetic || '', mood || '', JSON.stringify(design_guidelines || {}), row.id]
            );
            try { fs.unlinkSync(tempPath); } catch {}
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`Reference design guidelines re-indexing failed: ${msg}`);
          }
        })();
      });
    }
    return {
      id: String(row.id),
      s3_bucket: String(row.s3_bucket),
      s3_key: String(row.s3_key),
      sha256: String(row.sha256),
      scope: row.scope as ReferenceScope,
      owner_uid: row.owner_uid ? String(row.owner_uid) : null,
    };
  }

  const id = crypto.randomUUID();
  const bucket = getBucket();
  const key = s3KeyFor({ scope, ownerUid, id, originalFilename: params.originalFilename });
  const s3 = await getS3ForBucket(bucket);

  // Basic metadata
  const meta = await sharp(params.buffer).metadata().catch(() => null);
  const width = meta?.width ?? null;
  const height = meta?.height ?? null;
  const bytes = params.buffer.byteLength;

  // Upload to S3
  await s3
    .upload({
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.mime || 'application/octet-stream',
    })
    .promise();

  // Insert row
  await pool.query(
    `INSERT INTO reference_images
      (id, scope, owner_uid, sha256, original_filename, s3_bucket, s3_key, mime, bytes, width, height, tags, industry, aesthetic, mood, design_guidelines, ranking)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ARRAY[]::text[], '', '', '', '{}'::jsonb, 1)`,
    [id, scope, ownerUid, sha256, params.originalFilename, bucket, key, params.mime, bytes, width, height]
  );

  // Background indexing (non-blocking)
  setImmediate(() => {
    void (async () => {
      let tempPath: string | null = null;
      try {
        const tempDir = ensureTempDir();
        const ext = params.mime.includes('png') ? 'png' : params.mime.includes('webp') ? 'webp' : 'jpg';
        tempPath = path.join(tempDir, `${Date.now()}_${id}.${ext}`);
        fs.writeFileSync(tempPath, params.buffer);
        const { tags, industry, aesthetic, mood, design_guidelines } = await extractDesignGuidelinesWithGemini({ imagePath: tempPath });
        await pool.query(
          `UPDATE reference_images
           SET tags = $1, industry = $2, aesthetic = $3, mood = $4, design_guidelines = $5
           WHERE id = $6`,
          [tags, industry || '', aesthetic || '', mood || '', JSON.stringify(design_guidelines || {}), id]
        );
        logger.info(`Reference image indexed (Neon): id=${id} tags=${Array.isArray(tags) ? tags.length : 0} scope=${scope}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.warn(`Reference design guidelines indexing failed: ${msg}`);
      } finally {
        if (tempPath) {
          try {
            fs.unlinkSync(tempPath);
          } catch {}
        }
      }
    })();
  });

  return { id, s3_bucket: bucket, s3_key: key, sha256, scope, owner_uid: ownerUid };
}

export type ReferenceImageSearchResult = {
  id: string;
  url: string;
  tags: string[];
  industry: string;
  aesthetic: string;
  mood: string;
  design_guidelines: object;
  relevance_score: number;
  ranking?: number;
  scope: ReferenceScope;
};

function normalizeTerms(query: string): string[] {
  const q = (query || '').toLowerCase();
  return q
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, '').trim())
    .filter((t) => t.length > 2);
}

function scoreRow(row: any, terms: string[]): number {
  const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
  const industry = String(row.industry || '').toLowerCase();
  const aesthetic = String(row.aesthetic || '').toLowerCase();
  const mood = String(row.mood || '').toLowerCase();
  const filename = String(row.original_filename || '').toLowerCase();
  let score = 0;
  for (const term of terms) {
    const tagMatch = tags.filter((t) => String(t).toLowerCase().includes(term) || term.includes(String(t).toLowerCase())).length;
    score += tagMatch * 10;
    if (industry === term || industry.includes(term)) score += 8;
    if (aesthetic === term || aesthetic.includes(term)) score += 6;
    if (mood === term || mood.includes(term)) score += 5;
    if (filename.includes(term)) score += 2;
  }
  return score;
}

/**
 * Search reference images across:
 * - GLOBAL library
 * - USER library for the given uid
 */
export async function searchReferenceImages(params: {
  uid: string;
  query: string;
  limit?: number;
  signedUrlExpiresSeconds?: number;
}): Promise<ReferenceImageSearchResult[]> {
  await ensureSchema();
  const pool = getPool();
  const limit = params.limit || 3;
  const terms = normalizeTerms(params.query);

  // Pull a bounded candidate set then score in JS (simple + avoids dynamic SQL scoring).
  // We bias towards higher-ranked & recently created.
  const candidates = await pool.query(
    `
    SELECT id, scope, owner_uid, original_filename, s3_bucket, s3_key, tags, industry, aesthetic, mood, design_guidelines, ranking, created_at
    FROM reference_images
    WHERE scope = 'global' OR (scope = 'user' AND owner_uid = $1)
    ORDER BY ranking DESC, created_at DESC
    LIMIT 250
    `,
    [params.uid]
  );

  const expires = params.signedUrlExpiresSeconds ?? 10 * 60; // 10m

  if (terms.length === 0) {
    const slice = candidates.rows.slice(0, limit);
    return await Promise.all(
      slice.map(async (row: any) => ({
        id: String(row.id),
        scope: row.scope as ReferenceScope,
        url: await signedGetUrl({ bucket: String(row.s3_bucket), key: String(row.s3_key), expiresSeconds: expires }),
        tags: Array.isArray(row.tags) ? row.tags : [],
        industry: String(row.industry || ''),
        aesthetic: String(row.aesthetic || ''),
        mood: String(row.mood || ''),
        design_guidelines: row.design_guidelines && typeof row.design_guidelines === 'object' ? row.design_guidelines : {},
        relevance_score: 0,
        ranking: typeof row.ranking === 'number' ? row.ranking : 1,
      }))
    );
  }

  const scored = candidates.rows
    .map((row: any) => ({ row, score: scoreRow(row, terms) }))
    .filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      const br = typeof b.row.ranking === 'number' ? b.row.ranking : 1;
      const ar = typeof a.row.ranking === 'number' ? a.row.ranking : 1;
      return br - ar;
    })
    .slice(0, limit)
    .map((x: any) => x);

  if (scored.length > 0) {
    return await Promise.all(
      scored.map(async (x: any) => {
        const row = x.row;
        return {
          id: String(row.id),
          scope: row.scope as ReferenceScope,
          url: await signedGetUrl({ bucket: String(row.s3_bucket), key: String(row.s3_key), expiresSeconds: expires }),
          tags: Array.isArray(row.tags) ? row.tags : [],
          industry: String(row.industry || ''),
          aesthetic: String(row.aesthetic || ''),
          mood: String(row.mood || ''),
          design_guidelines: row.design_guidelines && typeof row.design_guidelines === 'object' ? row.design_guidelines : {},
          relevance_score: x.score,
          ranking: typeof row.ranking === 'number' ? row.ranking : 1,
        } as ReferenceImageSearchResult;
      })
    );
  }

  // Fallback if no matches: return top ranked.
  const fallback = candidates.rows.slice(0, limit);
  return await Promise.all(
    fallback.map(async (row: any) => ({
      id: String(row.id),
      scope: row.scope as ReferenceScope,
      url: await signedGetUrl({ bucket: String(row.s3_bucket), key: String(row.s3_key), expiresSeconds: expires }),
      tags: Array.isArray(row.tags) ? row.tags : [],
      industry: String(row.industry || ''),
      aesthetic: String(row.aesthetic || ''),
      mood: String(row.mood || ''),
      design_guidelines: row.design_guidelines && typeof row.design_guidelines === 'object' ? row.design_guidelines : {},
      relevance_score: 0,
      ranking: typeof row.ranking === 'number' ? row.ranking : 1,
    }))
  );
}

/**
 * Increment ranking for a reference image after successful usage.
 * Accepts a referenceId (preferred).
 */
export async function incrementReferenceRanking(params: { uid: string; referenceId: string }): Promise<void> {
  await ensureSchema();
  const pool = getPool();

  const referenceId = (params.referenceId || '').trim();
  if (!referenceId) return;

  // Enforce ownership rules:
  // - Global images can be incremented by anyone.
  // - User images can only be incremented by the owner.
  const res = await pool.query(
    `
    UPDATE reference_images
    SET ranking = ranking + 1
    WHERE id = $1
      AND (scope = 'global' OR (scope = 'user' AND owner_uid = $2))
    `,
    [referenceId, params.uid]
  );

  if (res.rowCount && res.rowCount > 0) {
    logger.info(`Incremented ranking for reference: id=${referenceId} by uid=${params.uid}`);
  } else {
    logger.warn(`No reference found (or not authorized) to increment ranking: id=${referenceId} uid=${params.uid}`);
  }
}
