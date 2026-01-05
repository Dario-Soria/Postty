#!/usr/bin/env ts-node

/**
 * Batch process to analyze and index all images in reference-library/images
 * 
 * Usage:
 *   npm run index-references
 *   OR
 *   npx ts-node scripts/index-reference-images.ts
 * 
 * Options:
 *   --force       Re-index all images, even if already indexed
 *   --limit N     Only process N images (for testing)
 */

// Load environment variables from .env file
import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { extractKeywordsWithGemini } from '../src/services/geminiMultimodal';

type SqliteDb = any;

const LIBRARY_ROOT = path.join(process.cwd(), 'reference-library');
const IMAGES_DIR = path.join(LIBRARY_ROOT, 'images');
const DB_PATH = path.join(LIBRARY_ROOT, 'index.sqlite');

function tryRequireBetterSqlite3(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('better-sqlite3');
  } catch (e) {
    console.error('❌ better-sqlite3 is not installed. Please run: npm install better-sqlite3');
    return null;
  }
}

function ensureDb(): SqliteDb | null {
  const BetterSqlite3 = tryRequireBetterSqlite3();
  if (!BetterSqlite3) return null;

  if (!fs.existsSync(LIBRARY_ROOT)) {
    fs.mkdirSync(LIBRARY_ROOT, { recursive: true });
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const db = new BetterSqlite3(DB_PATH);

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

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/jpeg';
}

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
}

async function indexImage(
  db: SqliteDb,
  imagePath: string,
  force: boolean = false
): Promise<{ success: boolean; message: string }> {
  const filename = path.basename(imagePath);
  
  if (!fs.existsSync(imagePath)) {
    return { success: false, message: 'File not found' };
  }

  try {
    const buffer = fs.readFileSync(imagePath);
    const sha256 = computeSha256(buffer);
    const mime = guessMimeType(filename);

    // Check if already indexed
    const existing = db
      .prepare('SELECT id, stored_path, keywords_json, description FROM reference_images WHERE sha256 = ?')
      .get(sha256);

    if (existing && !force) {
      const keywordsJson = typeof existing.keywords_json === 'string' ? existing.keywords_json : '[]';
      const description = typeof existing.description === 'string' ? existing.description : '';
      const needsIndex = keywordsJson.trim() === '[]' || description.trim().length === 0;

      if (!needsIndex) {
        return { success: true, message: 'Already indexed (skip)' };
      }
      
      // Has record but no keywords - update it
      console.log(`  ↻ Re-indexing (missing keywords): ${filename}`);
      const { description: desc, keywords } = await extractKeywordsWithGemini({
        imagePath,
        maxKeywords: 12,
      });

      db.prepare('UPDATE reference_images SET keywords_json = ?, description = ? WHERE id = ?')
        .run(JSON.stringify(keywords), desc, existing.id);

      return {
        success: true,
        message: `Updated with ${keywords.length} keywords`,
      };
    }

    if (existing && force) {
      console.log(`  ↻ Force re-indexing: ${filename}`);
      const { description: desc, keywords } = await extractKeywordsWithGemini({
        imagePath,
        maxKeywords: 12,
      });

      db.prepare('UPDATE reference_images SET keywords_json = ?, description = ? WHERE id = ?')
        .run(JSON.stringify(keywords), desc, existing.id);

      return {
        success: true,
        message: `Force updated with ${keywords.length} keywords`,
      };
    }

    // New image - add to database
    console.log(`  ✨ Indexing new image: ${filename}`);
    const id = crypto.randomUUID();
    const meta = await sharp(buffer).metadata().catch(() => null);
    const width = meta?.width ?? null;
    const height = meta?.height ?? null;
    const bytes = buffer.byteLength;
    const createdAt = new Date().toISOString();

    // Extract keywords with Gemini
    const { description, keywords } = await extractKeywordsWithGemini({
      imagePath,
      maxKeywords: 12,
    });

    // Insert into database
    db.prepare(
      `INSERT INTO reference_images
        (id, sha256, original_filename, stored_path, mime, bytes, width, height, created_at, keywords_json, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, sha256, filename, imagePath, mime, bytes, width, height, createdAt, JSON.stringify(keywords), description);

    // DO NOT rename files - they may have paired JSON metadata files
    // The keywords are stored in the database for searching/filtering
    return {
      success: true,
      message: `Indexed with ${keywords.length} keywords (filename preserved for JSON pairing)`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Error: ${msg}` };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 Reference Library Image Indexer');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null;

  if (force) {
    console.log('⚠️  Force mode: Will re-index all images\n');
  }
  if (limit) {
    console.log(`⚠️  Limit: Processing only ${limit} images\n`);
  }

  // Initialize database
  const db = ensureDb();
  if (!db) {
    console.error('❌ Failed to initialize database');
    process.exit(1);
  }

  console.log(`📂 Scanning: ${IMAGES_DIR}\n`);

  // Get all image files
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('❌ Images directory does not exist:', IMAGES_DIR);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(IMAGES_DIR);
  const imageFiles = allFiles.filter(isImageFile);

  if (imageFiles.length === 0) {
    console.log('✅ No images found to index');
    process.exit(0);
  }

  console.log(`📊 Found ${imageFiles.length} image file(s)\n`);

  const filesToProcess = limit ? imageFiles.slice(0, limit) : imageFiles;
  
  let processed = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const imagePath = path.join(IMAGES_DIR, file);
    
    console.log(`[${i + 1}/${filesToProcess.length}] Processing: ${file}`);
    
    const result = await indexImage(db, imagePath, force);
    processed++;

    if (result.success) {
      if (result.message.includes('skip')) {
        skipped++;
        console.log(`  ✓ ${result.message}`);
      } else {
        succeeded++;
        console.log(`  ✓ ${result.message}`);
      }
    } else {
      failed++;
      console.log(`  ✗ ${result.message}`);
    }
    
    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 Summary:');
  console.log(`   Total processed: ${processed}`);
  console.log(`   ✓ Succeeded:     ${succeeded}`);
  console.log(`   → Skipped:       ${skipped}`);
  console.log(`   ✗ Failed:        ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⚠️  Some images failed to index. Check the errors above.');
  } else if (succeeded > 0) {
    console.log('✅ All images indexed successfully!');
  } else {
    console.log('✅ All images were already indexed.');
  }

  db.close();
}

// Run the script
main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

