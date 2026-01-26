import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { saveReferenceImageAsync } from '../src/services/referenceLibrarySqlite';

// Load .env for local runs (so users don't need to export DATABASE_URL, AWS_*, GEMINI_API_KEY manually).
// In production/CI, env vars should be provided by the runtime.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
} catch {
  // ignore if dotenv isn't available for some reason
}

function normalizeDatabaseUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';

  // If someone pasted a Neon console helper command like:
  //   psql 'postgresql://user:pass@host/db?sslmode=require'
  // strip the wrapper.
  if (s.toLowerCase().startsWith('psql ')) {
    s = s.slice('psql '.length).trim();
  }

  // Strip wrapping quotes.
  if (
    (s.startsWith("'") && s.endsWith("'") && s.length > 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length > 2)
  ) {
    s = s.slice(1, -1).trim();
  }

  return s;
}

function safeDbInfo(url: string): string {
  try {
    const u = new URL(url);
    // Never print credentials.
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

function mimeFromExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function isImageFile(filename: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(filename);
}

async function waitForIndexing(pool: Pool, id: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const r = await pool.query('SELECT design_guidelines FROM reference_images WHERE id = $1', [id]);
    const v = r.rows?.[0]?.design_guidelines;
    const ready = v && typeof v === 'object' && Object.keys(v).length > 0;
    if (ready) return;

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for indexing: ${id}`);
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(prefix));
  if (!a) return null;
  return a.slice(prefix.length);
}

async function main(): Promise<void> {
  const dir = (argValue('dir') || '').trim();
  const wait = process.argv.includes('--wait');
  if (!dir) throw new Error('Missing --dir=/absolute/path/to/folder');

  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '');
  if (!databaseUrl) throw new Error('Missing DATABASE_URL (Neon connection string)');

  console.log(`Using DATABASE_URL: ${safeDbInfo(databaseUrl)}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  const entries = fs.readdirSync(dir);
  const files = entries.filter(isImageFile);

  console.log(`Found ${files.length} image(s) in ${dir}`);

  for (const name of files) {
    const fullPath = path.join(dir, name);
    const buf = fs.readFileSync(fullPath);
    const mime = mimeFromExt(name);

    // Global library import: ownerUid = null
    const saved = await saveReferenceImageAsync({
      buffer: buf,
      originalFilename: name,
      mime,
      ownerUid: null,
    });

    if (!saved) {
      console.log(`SKIP (save returned null): ${name}`);
      continue;
    }

    console.log(`IMPORTED: ${name} -> id=${saved.id} s3://${saved.s3_bucket}/${saved.s3_key}`);

    if (wait) {
      await waitForIndexing(pool, saved.id);
      console.log(`INDEXED: id=${saved.id}`);
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



