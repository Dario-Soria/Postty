import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import * as logger from '../utils/logger';
import { extractDesignGuidelinesWithGemini } from './geminiMultimodal';

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
      tags TEXT,
      industry TEXT,
      aesthetic TEXT,
      mood TEXT,
      design_guidelines TEXT
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_reference_images_created_at ON reference_images(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reference_images_industry ON reference_images(industry);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reference_images_aesthetic ON reference_images(aesthetic);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reference_images_tags ON reference_images(tags);`);
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
    .prepare('SELECT id, stored_path, sha256, tags, industry, aesthetic, mood, design_guidelines FROM reference_images WHERE sha256 = ?')
    .get(sha256);
  if (existing?.id && existing?.stored_path) {
    const designGuidelines = typeof existing.design_guidelines === 'string' ? existing.design_guidelines : '';
    const needsIndex = designGuidelines.trim().length === 0;

    if (needsIndex && fs.existsSync(existing.stored_path)) {
      setImmediate(() => {
        void (async () => {
          try {
            const { tags, industry, aesthetic, mood, design_guidelines } = await extractDesignGuidelinesWithGemini({
              imagePath: existing.stored_path,
            });
            dbi
              .prepare('UPDATE reference_images SET tags = ?, industry = ?, aesthetic = ?, mood = ?, design_guidelines = ? WHERE id = ?')
              .run(tags.join(', '), industry, aesthetic, mood, JSON.stringify(design_guidelines), existing.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`Reference design guidelines re-indexing failed: ${msg}`);
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
        (id, sha256, original_filename, stored_path, mime, bytes, width, height, created_at, tags, industry, aesthetic, mood, design_guidelines)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, sha256, params.originalFilename, storedPath, params.mime, bytes, width, height, createdAt, '', '', '', '', '');

  // Background indexing (non-blocking)
  // NOTE: We DO NOT rename files because they may have paired JSON metadata files
  // with the same filename. Design guidelines are stored in the database instead.
  setImmediate(() => {
    void (async () => {
      try {
        const { tags, industry, aesthetic, mood, design_guidelines } = await extractDesignGuidelinesWithGemini({ imagePath: storedPath });
        
        // Update database with design guidelines (keep original path)
        dbi
          .prepare('UPDATE reference_images SET tags = ?, industry = ?, aesthetic = ?, mood = ?, design_guidelines = ? WHERE id = ?')
          .run(tags.join(', '), industry, aesthetic, mood, JSON.stringify(design_guidelines), id);
        
        logger.info(`Reference image indexed: ${path.basename(storedPath)} (${tags.length} tags)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.warn(`Reference design guidelines indexing failed: ${msg}`);
      }
    })();
  });

  return { id, stored_path: storedPath, sha256 };
}

export type ReferenceImageSearchResult = {
  id: string;
  stored_path: string;
  filename: string;
  tags: string[];
  industry: string;
  aesthetic: string;
  mood: string;
  design_guidelines: object;
  relevance_score: number;
};

function parseTags(tagsString: string): string[] {
  if (!tagsString || typeof tagsString !== 'string') return [];
  return tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

function tryParseDesignGuidelines(designGuidelinesJson: string): object {
  try {
    const parsed = JSON.parse(designGuidelinesJson || '{}');
    return typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Search reference images by tags, industry, aesthetic, mood
 * Returns top N most relevant images based on design guideline matching
 */
export async function searchReferenceImages(params: {
  query: string;
  limit?: number;
}): Promise<ReferenceImageSearchResult[]> {
  const dbi = ensureDb();
  if (!dbi) return [];

  const limit = params.limit || 3;
  const queryLower = params.query.toLowerCase();
  
  // Extract search terms from query
  const searchTerms = queryLower
    .split(/\s+/)
    .filter(term => term.length > 2) // Ignore very short words
    .map(term => term.replace(/[^a-z0-9]/g, '')); // Clean terms

  if (searchTerms.length === 0) {
    // No valid search terms, return most recent images
    const rows = dbi
      .prepare(`
        SELECT id, stored_path, original_filename, tags, industry, aesthetic, mood, design_guidelines 
        FROM reference_images 
        WHERE design_guidelines != ''
        ORDER BY created_at DESC 
        LIMIT ?
      `)
      .all(limit);
    
    return rows.map((row: any) => ({
      id: row.id,
      stored_path: row.stored_path,
      filename: path.basename(row.stored_path),
      tags: parseTags(row.tags),
      industry: row.industry || '',
      aesthetic: row.aesthetic || '',
      mood: row.mood || '',
      design_guidelines: tryParseDesignGuidelines(row.design_guidelines),
      relevance_score: 0,
    }));
  }

  // Get all indexed images
  const allImages = dbi
    .prepare(`
      SELECT id, stored_path, original_filename, tags, industry, aesthetic, mood, design_guidelines 
      FROM reference_images 
      WHERE design_guidelines != ''
    `)
    .all();

  // Score each image by relevance
  const scored = allImages
    .map((row: any) => {
      const tags = parseTags(row.tags);
      const industry = (row.industry || '').toLowerCase();
      const aesthetic = (row.aesthetic || '').toLowerCase();
      const mood = (row.mood || '').toLowerCase();
      const filename = (row.original_filename || '').toLowerCase();
      
      let score = 0;
      
      // Check each search term against tags, industry, aesthetic, mood, filename
      for (const term of searchTerms) {
        // Tags match (highest weight)
        const tagMatch = tags.filter(tag => 
          tag.toLowerCase().includes(term) || term.includes(tag.toLowerCase())
        ).length;
        score += tagMatch * 10;
        
        // Industry exact match (high weight)
        if (industry === term || industry.includes(term)) {
          score += 8;
        }
        
        // Aesthetic exact match (medium-high weight)
        if (aesthetic === term || aesthetic.includes(term)) {
          score += 6;
        }
        
        // Mood match (medium weight)
        if (mood === term || mood.includes(term)) {
          score += 5;
        }
        
        // Filename match (low weight)
        if (filename.includes(term)) {
          score += 2;
        }
      }
      
      return {
        id: row.id,
        stored_path: row.stored_path,
        filename: path.basename(row.stored_path),
        tags,
        industry: row.industry || '',
        aesthetic: row.aesthetic || '',
        mood: row.mood || '',
        design_guidelines: tryParseDesignGuidelines(row.design_guidelines),
        relevance_score: score,
      };
    })
    .filter((img: ReferenceImageSearchResult) => img.relevance_score > 0) // Only return matches
    .sort((a: ReferenceImageSearchResult, b: ReferenceImageSearchResult) => b.relevance_score - a.relevance_score) // Sort by relevance
    .slice(0, limit); // Take top N

  // If no matches found, return most recent
  if (scored.length === 0) {
    const rows = dbi
      .prepare(`
        SELECT id, stored_path, original_filename, tags, industry, aesthetic, mood, design_guidelines 
        FROM reference_images 
        WHERE design_guidelines != ''
        ORDER BY created_at DESC 
        LIMIT ?
      `)
      .all(limit);
    
    return rows.map((row: any) => ({
      id: row.id,
      stored_path: row.stored_path,
      filename: path.basename(row.stored_path),
      tags: parseTags(row.tags),
      industry: row.industry || '',
      aesthetic: row.aesthetic || '',
      mood: row.mood || '',
      design_guidelines: tryParseDesignGuidelines(row.design_guidelines),
      relevance_score: 0,
    }));
  }

  return scored;
}


