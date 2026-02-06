#!/usr/bin/env npx ts-node

/**
 * Re-analyze all reference images in Neon PostgreSQL
 * This script updates text_in_image and text_analysis based on the new prompt
 * that ignores text on product labels/packaging
 * 
 * Usage:
 *   npx ts-node scripts/reanalyze-references.ts
 *   OR
 *   npx ts-node scripts/reanalyze-references.ts --force  (re-analyze all, not just those with text)
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as AWS from 'aws-sdk';
import { extractDesignGuidelinesWithGemini } from '../src/services/geminiMultimodal';

function normalizeDatabaseUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('psql ')) {
    s = s.slice('psql '.length).trim();
  }
  if (
    (s.startsWith("'") && s.endsWith("'") && s.length > 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length > 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

const connectionString = normalizeDatabaseUrl(
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || ''
);

if (!connectionString) {
  console.error('❌ Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 5 });

// S3 setup
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

function ensureTempDir(): string {
  const tempDir = path.join(process.cwd(), 'temp-reanalyze');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

async function downloadFromS3(bucket: string, key: string, localPath: string): Promise<void> {
  const data = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  fs.writeFileSync(localPath, data.Body as Buffer);
}

async function reanalyzeReference(row: any): Promise<{ success: boolean; message: string }> {
  const tempDir = ensureTempDir();
  const ext = row.mime?.includes('png') ? 'png' : row.mime?.includes('webp') ? 'webp' : 'jpg';
  const tempPath = path.join(tempDir, `${row.id}.${ext}`);
  
  try {
    // Download image from S3
    console.log(`    📥 Downloading from S3: ${row.s3_key}`);
    await downloadFromS3(row.s3_bucket, row.s3_key, tempPath);
    
    // Re-analyze with Gemini
    console.log(`    🔍 Analyzing with Gemini...`);
    const result = await extractDesignGuidelinesWithGemini({ imagePath: tempPath });
    
    // Update database
    await pool.query(
      `UPDATE reference_images
       SET tags = $1, industry = $2, aesthetic = $3, mood = $4, design_guidelines = $5, 
           post_type = $6, text_in_image = $7, text_analysis = $8, product_category = $9
       WHERE id = $10`,
      [
        result.tags,
        result.industry || '',
        result.aesthetic || '',
        result.mood || '',
        JSON.stringify(result.design_guidelines || {}),
        result.post_type,
        result.text_in_image,
        result.text_analysis ? JSON.stringify(result.text_analysis) : null,
        result.product_category,
        row.id
      ]
    );
    
    return {
      success: true,
      message: `Updated: product_category=${result.product_category || 'null'}, post_type=${result.post_type || 'null'}`
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Error: ${msg}` };
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔄 Reference Image Re-Analyzer (Neon PostgreSQL)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const nullCategoryOnly = args.includes('--null-category');
  
  if (force) {
    console.log('⚠️  Force mode: Will re-analyze ALL references\n');
  } else if (nullCategoryOnly) {
    console.log('📋 Null category mode: Only re-analyzing references with product_category IS NULL\n');
  } else {
    console.log('📋 Normal mode: Only re-analyzing references that currently have text_in_image = "yes"\n');
  }
  
  // Get references to re-analyze
  let query = `SELECT id, s3_bucket, s3_key, mime, original_filename, text_in_image, product_category FROM reference_images`;
  if (nullCategoryOnly) {
    query += ` WHERE product_category IS NULL`;
  } else if (!force) {
    query += ` WHERE text_in_image = 'yes' OR text_in_image IS NOT NULL`;
  }
  query += ` ORDER BY created_at DESC`;
  
  const result = await pool.query(query);
  const references = result.rows;
  
  console.log(`📊 Found ${references.length} reference(s) to process\n`);
  
  if (references.length === 0) {
    console.log('✅ Nothing to process');
    await pool.end();
    process.exit(0);
  }
  
  let succeeded = 0;
  let failed = 0;
  
  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    console.log(`[${i + 1}/${references.length}] Processing: ${ref.original_filename} (${ref.id.slice(0, 8)}...)`);
    console.log(`    Current text_in_image: ${ref.text_in_image || 'null'}`);
    
    const res = await reanalyzeReference(ref);
    
    if (res.success) {
      succeeded++;
      console.log(`    ✅ ${res.message}`);
    } else {
      failed++;
      console.log(`    ❌ ${res.message}`);
    }
    console.log('');
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 Summary:');
  console.log(`   Total processed: ${references.length}`);
  console.log(`   ✓ Succeeded:     ${succeeded}`);
  console.log(`   ✗ Failed:        ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  await pool.end();
  
  // Clean up temp directory
  const tempDir = path.join(process.cwd(), 'temp-reanalyze');
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir, { recursive: true });
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
