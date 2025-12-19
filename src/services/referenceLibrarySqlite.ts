import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import * as logger from '../utils/logger';
import { extractKeywordsWithGemini } from './geminiMultimodal';

type SqliteDb = any;

function getLibraryRoot(): string {
  return path.join(process.cwd(), 'reference-library');
}

function ensureDirs(): { root: string; imagesDir: string } {
  const root = getLibraryRoot();
  const imagesDir = path.join(root, 'images');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  return { root, imagesDir };
}

function computeSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function tryRequireBetterSqlite3(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('better-sqlite3');
  } catch (e) {
    logger.warn('better-sqlite3 is not installed; reference library indexing is disabled.');
    return null;
  }
}

let db: SqliteDb | null = null;

function ensureDb(): SqliteDb | null {
  if (db) return db;
  const BetterSqlite3 = tryRequireBetterSqlite3();
  if (!BetterSqlite3) return null;

  const { root } = ensureDirs();
  const dbPath = path.join(root, 'index.sqlite');
  db = new BetterSqlite3(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reference_images (
      id TEXT PRIMARY KEY,
      sha256 TEXT UNIQUE,
      original_filename TEXT,
      stored_path TEXT,
      mime TEXT,
      bytes INTEGER,
      width INTEGER,
      height INTEGER,
      created_at TEXT,
      keywords_json TEXT,
      description TEXT
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_reference_images_created_at ON reference_images(created_at);`);
  return db;
}

export type SavedReferenceImage = {
  id: string;
  stored_path: string;
  sha256: string;
};

/**
 * Save a reference image for future retrieval, and index it asynchronously with Gemini keywords.
 * This function never blocks the caller on keyword extraction.
 */
export async function saveReferenceImageAsync(params: {
  buffer: Buffer;
  originalFilename: string;
  mime: string;
}): Promise<SavedReferenceImage | null> {
  const dbi = ensureDb();
  if (!dbi) return null;

  const { imagesDir } = ensureDirs();
  const sha256 = computeSha256(params.buffer);

  // Dedupe (but if the existing row hasn't been indexed yet, re-run indexing async)
  const existing = dbi
    .prepare('SELECT id, stored_path, sha256, keywords_json, description FROM reference_images WHERE sha256 = ?')
    .get(sha256);
  if (existing?.id && existing?.stored_path) {
    const keywordsJson = typeof existing.keywords_json === 'string' ? existing.keywords_json : '[]';
    const description = typeof existing.description === 'string' ? existing.description : '';
    const needsIndex = keywordsJson.trim() === '[]' || description.trim().length === 0;

    if (needsIndex && fs.existsSync(existing.stored_path)) {
      setImmediate(() => {
        void (async () => {
          try {
            const { description: desc, keywords } = await extractKeywordsWithGemini({
              imagePath: existing.stored_path,
              maxKeywords: 12,
            });
            dbi
              .prepare('UPDATE reference_images SET keywords_json = ?, description = ? WHERE id = ?')
              .run(JSON.stringify(keywords), desc, existing.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`Reference keyword re-indexing failed: ${msg}`);
          }
        })();
      });
    }

    return { id: existing.id, stored_path: existing.stored_path, sha256: existing.sha256 };
  }

  const id = crypto.randomUUID();
  const ext = params.mime.includes('png') ? 'png' : params.mime.includes('webp') ? 'webp' : 'jpg';
  const tempName = `${Date.now()}_${id}.${ext}`;
  const storedPath = path.join(imagesDir, tempName);
  fs.writeFileSync(storedPath, params.buffer);

  const meta = await sharp(params.buffer).metadata().catch(() => null);
  const width = meta?.width ?? null;
  const height = meta?.height ?? null;
  const bytes = params.buffer.byteLength;
  const createdAt = new Date().toISOString();

  dbi
    .prepare(
      `INSERT INTO reference_images
        (id, sha256, original_filename, stored_path, mime, bytes, width, height, created_at, keywords_json, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, sha256, params.originalFilename, storedPath, params.mime, bytes, width, height, createdAt, '[]', '');

  // Background indexing (non-blocking)
  setImmediate(() => {
    void (async () => {
      try {
        const { description, keywords } = await extractKeywordsWithGemini({ imagePath: storedPath, maxKeywords: 12 });
        const keywordSlug = keywords.slice(0, 5).map(slugify).filter(Boolean).join('_');
        const finalName = `${Date.now()}_${keywordSlug || 'ref'}_${id}.${ext}`;
        const finalPath = path.join(imagesDir, finalName);

        try {
          fs.renameSync(storedPath, finalPath);
        } catch {
          // If rename fails, keep original path.
        }

        dbi
          .prepare('UPDATE reference_images SET keywords_json = ?, description = ?, stored_path = ? WHERE id = ?')
          .run(JSON.stringify(keywords), description, fs.existsSync(finalPath) ? finalPath : storedPath, id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.warn(`Reference keyword indexing failed: ${msg}`);
      }
    })();
  });

  return { id, stored_path: storedPath, sha256 };
}


