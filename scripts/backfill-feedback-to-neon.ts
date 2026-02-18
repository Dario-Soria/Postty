#!/usr/bin/env ts-node

/**
 * Backfill legacy v3 feedback logs into Neon Postgres.
 *
 * Reads:
 *   frontend/feedback-logs/_all_feedback.json
 *
 * Writes into:
 *   feedback_entries (Neon)
 *
 * Usage:
 *   npx ts-node scripts/backfill-feedback-to-neon.ts
 */

import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';

type LegacyFeedbackEntry = {
  timestamp?: string;
  email?: string;
  easeOfUseRating?: number;
  resultQualityRating?: number;
  comment?: string;
};

function normalizeDatabaseUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('psql ')) s = s.slice('psql '.length).trim();
  if (
    (s.startsWith("'") && s.endsWith("'") && s.length > 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length > 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function stableUuidFromString(input: string): string {
  const hex = crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback_entries (
      id uuid PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      uid text NOT NULL,
      email text NULL,
      name text NULL,
      ease_of_use_rating integer NOT NULL CHECK (ease_of_use_rating >= 1 AND ease_of_use_rating <= 5),
      result_quality_rating integer NOT NULL CHECK (result_quality_rating >= 1 AND result_quality_rating <= 5),
      comment text NOT NULL DEFAULT ''
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_feedback_entries_created_at ON feedback_entries(created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_feedback_entries_uid_created_at ON feedback_entries(uid, created_at DESC);`);
}

async function main(): Promise<void> {
  const connectionString = normalizeDatabaseUrl(
    process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || ''
  );
  if (!connectionString) throw new Error('Missing DATABASE_URL / NEON_DATABASE_URL / POSTGRES_URL');

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
  });

  try {
    await ensureSchema(pool);

    const logPath = path.join(process.cwd(), 'frontend', 'feedback-logs', '_all_feedback.json');
    if (!fs.existsSync(logPath)) {
      console.log(`No legacy feedback file found at ${logPath}`);
      return;
    }

    const raw = fs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(raw);
    const entries: LegacyFeedbackEntry[] = Array.isArray(parsed) ? parsed : [parsed];

    let inserted = 0;
    let skipped = 0;

    for (const e of entries) {
      const email = (e.email || '').trim() || 'unknown';
      const uid = `legacy_email:${email}`;
      const createdAt = e.timestamp && e.timestamp.trim() ? new Date(e.timestamp) : new Date();
      const r1 = Number.isFinite(e.easeOfUseRating as any) ? Math.trunc(e.easeOfUseRating as any) : null;
      const r2 = Number.isFinite(e.resultQualityRating as any) ? Math.trunc(e.resultQualityRating as any) : null;
      const comment = (e.comment || '').toString();

      if (!r1 || r1 < 1 || r1 > 5 || !r2 || r2 < 1 || r2 > 5) {
        skipped++;
        continue;
      }

      const id = stableUuidFromString(
        JSON.stringify({ uid, email, createdAt: createdAt.toISOString(), r1, r2, comment })
      );

      const res = await pool.query(
        `INSERT INTO feedback_entries
           (id, created_at, uid, email, name, ease_of_use_rating, result_quality_rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [id, createdAt.toISOString(), uid, email, null, r1, r2, comment]
      );

      if (res.rowCount === 1) inserted++;
      else skipped++;
    }

    console.log(`Backfill complete. Inserted=${inserted}, skipped=${skipped}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Backfill failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});

