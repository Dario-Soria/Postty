import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { extractStyleProfileFromReferences, StyleProfile } from '../services/geminiStyleProfile';
import { saveReferenceImageAsync } from '../services/referenceLibrarySqlite';

async function readMultipartReferences(request: FastifyRequest): Promise<{
  tempReferencePaths: string[];
  languageHint: string | null;
}> {
  const parts = (request as any).parts?.();
  if (!parts) throw new Error('Multipart request expected but parts() is not available');

  const tempReferencePaths: string[] = [];
  let languageHint: string | null = null;

  const tempDir = path.join(process.cwd(), 'temp-uploads', 'style-profile');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const files: Array<{ buffer: Buffer; filename: string; mimetype: string }> = [];

  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname === 'references' || part.fieldname === 'reference') {
        const buf = await part.toBuffer();
        files.push({
          buffer: buf,
          filename: part.filename || 'reference',
          mimetype: part.mimetype || 'application/octet-stream',
        });
      }
    } else {
      const v = part.value as any;
      if (part.fieldname === 'language') languageHint = String(v || '').trim() || null;
    }
  }

  if (files.length === 0) throw new Error('Missing reference files field "references"');

  const ts = Date.now();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.mimetype.startsWith('image/')) continue;
    const ext = f.filename.split('.').pop() || 'jpg';
    const p = path.join(tempDir, `${ts}_ref_${i + 1}.${ext}`);
    fs.writeFileSync(p, f.buffer);
    tempReferencePaths.push(p);

    // Fire-and-forget: index into SQLite without blocking.
    void saveReferenceImageAsync({ buffer: f.buffer, originalFilename: f.filename, mime: f.mimetype });
  }

  if (tempReferencePaths.length === 0) throw new Error('No valid image references provided');

  return { tempReferencePaths, languageHint };
}

export default async function styleProfileRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/style-profile', async (request: FastifyRequest, reply: FastifyReply) => {
    let tempReferencePaths: string[] = [];
    try {
      const ct = String((request.headers as any)?.['content-type'] || '').toLowerCase();
      if (!ct.includes('multipart/form-data')) {
        return reply.status(400).send({ status: 'error', message: 'Multipart form-data required' });
      }

      const parsed = await readMultipartReferences(request);
      tempReferencePaths = parsed.tempReferencePaths;
      const languageHint = parsed.languageHint;

      const styleProfile: StyleProfile | null = await extractStyleProfileFromReferences({
        imagePaths: tempReferencePaths,
        maxImages: 6,
        language: languageHint || undefined,
      });

      if (!styleProfile) {
        return reply.status(200).send({ status: 'success', style_profile: null });
      }

      return reply.status(200).send({ status: 'success', style_profile: styleProfile });
    } catch (e) {
      const anyErr = e as any;
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const code = typeof anyErr?.code === 'string' ? anyErr.code : '';

      // @fastify/multipart can throw with FST_REQ_FILE_TOO_LARGE (or message "request file too large")
      if (code === 'FST_REQ_FILE_TOO_LARGE' || msg.toLowerCase().includes('file too large')) {
        return reply.status(413).send({
          status: 'error',
          message:
            'Reference image(s) too large. Please upload smaller files (try exporting JPGs) or increase POSTTY_FILE_LIMIT_BYTES.',
        });
      }

      logger.error('Error in /style-profile:', msg);
      return reply.status(500).send({ status: 'error', message: msg });
    } finally {
      for (const p of tempReferencePaths) {
        if (p && fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
          } catch {
            // ignore
          }
        }
      }
    }
  });
}


