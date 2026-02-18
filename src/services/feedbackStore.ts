import { Pool } from 'pg';
import crypto from 'crypto';

export type FeedbackEntryInsert = {
  uid: string;
  email?: string | null;
  name?: string | null;
  easeOfUseRating: number;
  resultQualityRating: number;
  comment?: string | null;
};

let _pool: Pool | null = null;
let _schemaReady = false;

function normalizeDatabaseUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';

  // Neon Console sometimes provides: psql 'postgresql://...'
  if (s.toLowerCase().startsWith('psql ')) {
    s = s.slice('psql '.length).trim();
  }

  // Strip wrapping quotes
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
  _pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
  });
  return _pool;
}

export async function ensureFeedbackSchema(): Promise<void> {
  if (_schemaReady) return;
  const pool = getPool();
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
  _schemaReady = true;
}

export async function insertFeedbackEntry(input: FeedbackEntryInsert): Promise<{ id: string }> {
  await ensureFeedbackSchema();
  const pool = getPool();
  const id = crypto.randomUUID();
  const res = await pool.query(
    `INSERT INTO feedback_entries
      (id, uid, email, name, ease_of_use_rating, result_quality_rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      id,
      input.uid,
      input.email ?? null,
      input.name ?? null,
      input.easeOfUseRating,
      input.resultQualityRating,
      (input.comment ?? '').toString(),
    ]
  );
  return { id: String(res.rows?.[0]?.id) };
}

