import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as logger from '../utils/logger';
import { parseBooleanInput } from '../utils/featureFlags';
import { generateImagenImage } from '../services/geminiImageGenerator';
import { extractSubjectMaskWithGemini } from '../services/geminiMultimodal';
import { mergeProductOnBackground } from '../services/productMergeV2';
import { saveReferenceImageAsync } from '../services/referenceLibrarySqlite';
import { orchestrateV2Prompt } from '../services/v2GeminiOrchestrator';

function ensureTempDir(): string {
  const dir = path.join(process.cwd(), 'temp-uploads', 'v2');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

async function readMultipartToBuffers(req: any): Promise<{
  fields: Record<string, string>;
  files: Array<{ fieldname: string; filename: string; mimetype: string; buffer: Buffer }>;
}> {
  const fields: Record<string, string> = {};
  const files: Array<{ fieldname: string; filename: string; mimetype: string; buffer: Buffer }> = [];

  // @fastify/multipart: req.parts() async iterator
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const chunks: Buffer[] = [];
      for await (const ch of part.file) chunks.push(ch as Buffer);
      files.push({
        fieldname: part.fieldname,
        filename: part.filename || 'upload',
        mimetype: part.mimetype || 'application/octet-stream',
        buffer: Buffer.concat(chunks),
      });
    } else if (part.type === 'field') {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }

  return { fields, files };
}

function sendNdjson(reply: any, obj: unknown): void {
  reply.raw.write(`${JSON.stringify(obj)}\n`);
}

async function generateBackground1080(prompt: string): Promise<string> {
  const rawPath = await generateImagenImage(prompt);
  // Normalize to 1080x1080 PNG for compositing consistency.
  const outPath = path.join(process.cwd(), 'generated-images', `${Date.now()}_v2_bg_1080.png`);
  await sharp(rawPath).resize(1080, 1080, { fit: 'cover', position: 'centre' }).png().toFile(outPath);
  return outPath;
}

export default async function v2GenerateRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /v2/generate (text-only)
   */
  fastify.post('/v2/generate', async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const numCandidates = typeof body.num_candidates === 'number' ? Math.min(Math.max(body.num_candidates, 1), 6) : 3;
    const previewOnly = parseBooleanInput(body.preview_only);

    if (!prompt.trim()) {
      return reply.status(400).send({ error: 'Missing prompt' });
    }

    reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    reply.raw.writeHead(200);

    sendNdjson(reply, { type: 'meta', flow: 'v2_text_only', num_candidates: numCandidates });

    const orchestration = await orchestrateV2Prompt({ userPrompt: prompt }).catch(() => ({
      background_prompt: prompt,
      foreground_width_ratio: 0.42,
      center_y_ratio: 0.62,
      product_description: '',
    }));

    for (let i = 0; i < numCandidates; i++) {
      const imagePath = await generateBackground1080(orchestration.background_prompt);

      const buf = fs.readFileSync(imagePath);
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      sendNdjson(reply, {
        type: 'candidate',
        candidate_id: `v2_${Date.now()}_${i}`,
        image: {
          path: imagePath,
          preview_data_url: previewOnly ? dataUrl : undefined,
        },
      });
    }

    sendNdjson(reply, { type: 'done' });
    reply.raw.end();
  });

  /**
   * POST /v2/generate-with-image (product + text; Gemini background + local merge)
   * Multipart fields:
   * - prompt (string)
   * - image (file)  <-- product
   */
  fastify.post('/v2/generate-with-image', async (req, reply) => {
    const { fields, files } = await readMultipartToBuffers(req);
    const prompt = (fields.prompt || '').trim();
    const numCandidates = fields.num_candidates ? Math.min(Math.max(parseInt(fields.num_candidates, 10) || 3, 1), 6) : 3;
    const previewOnly = parseBooleanInput(fields.preview_only);

    const product = files.find((f) => f.fieldname === 'image') || files[0];
    if (!prompt) return reply.status(400).send({ error: 'Missing prompt' });
    if (!product) return reply.status(400).send({ error: 'Missing image file field "image"' });

    const tempDir = ensureTempDir();
    const productPath = path.join(tempDir, `${Date.now()}_product_${product.filename}`);
    fs.writeFileSync(productPath, product.buffer);

    // Precompute mask once per request (product is same).
    const mask = await extractSubjectMaskWithGemini({ imagePath: productPath }).catch((e) => {
      const msg = e instanceof Error ? e.message : 'unknown';
      logger.warn(`Gemini subject mask extraction failed, falling back to bbox default. ${msg}`);
      return null;
    });

    const orchestration = await orchestrateV2Prompt({
      userPrompt: prompt,
      // For now, we let mask extraction be the only multimodal step. If you want richer product description,
      // we can extend geminiMultimodal.ts to return it here.
    }).catch(() => ({
      background_prompt: prompt,
      foreground_width_ratio: 0.42,
      center_y_ratio: 0.62,
      product_description: '',
    }));

    reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    reply.raw.writeHead(200);
    sendNdjson(reply, { type: 'meta', flow: 'v2_product_merge', num_candidates: numCandidates });

    for (let i = 0; i < numCandidates; i++) {
      const backgroundPath = await generateBackground1080(orchestration.background_prompt);

      const mergedPath = await mergeProductOnBackground({
        productPath,
        backgroundPath,
        mask,
        outSize: 1080,
        foregroundWidthRatio: orchestration.foreground_width_ratio,
        centerYRatio: orchestration.center_y_ratio,
      });

      const mergedBuf = fs.readFileSync(mergedPath);
      const dataUrl = `data:image/png;base64,${mergedBuf.toString('base64')}`;

      sendNdjson(reply, {
        type: 'candidate',
        candidate_id: `v2_${Date.now()}_${i}`,
        image: {
          path: mergedPath,
          preview_data_url: previewOnly ? dataUrl : undefined,
        },
      });
    }

    sendNdjson(reply, { type: 'done' });
    reply.raw.end();
  });

  /**
   * POST /v2/generate-with-references (product + text + N reference images)
   * Multipart fields:
   * - prompt (string)
   * - image (file) <-- product
   * - references (file, repeated)
   *
   * Behavior:
   * - Uses uploaded references as candidate backgrounds (fast, deterministic).
   * - Saves references to local library and indexes them asynchronously (SQLite + Gemini keywords).
   */
  fastify.post('/v2/generate-with-references', async (req, reply) => {
    const { fields, files } = await readMultipartToBuffers(req);
    const prompt = (fields.prompt || '').trim();
    const previewOnly = parseBooleanInput(fields.preview_only);
    const numCandidates = fields.num_candidates ? Math.min(Math.max(parseInt(fields.num_candidates, 10) || 3, 1), 12) : 3;

    const product = files.find((f) => f.fieldname === 'image') || files[0];
    const references = files.filter((f) => f.fieldname === 'references' || f.fieldname === 'reference');

    if (!prompt) return reply.status(400).send({ error: 'Missing prompt' });
    if (!product) return reply.status(400).send({ error: 'Missing image file field "image"' });
    if (references.length === 0) return reply.status(400).send({ error: 'Missing reference files field "references"' });

    const tempDir = ensureTempDir();
    const productPath = path.join(tempDir, `${Date.now()}_product_${product.filename}`);
    fs.writeFileSync(productPath, product.buffer);

    // Save references asynchronously (never blocks generation).
    for (const ref of references) {
      void saveReferenceImageAsync({ buffer: ref.buffer, originalFilename: ref.filename, mime: ref.mimetype });
    }

    // Subject mask once.
    const mask = await extractSubjectMaskWithGemini({ imagePath: productPath }).catch(() => null);

    const orchestration = await orchestrateV2Prompt({
      userPrompt: prompt,
      referenceStyleHints: `User uploaded ${references.length} reference images. Keep background style similar to the references.`,
    }).catch(() => ({
      background_prompt: prompt,
      foreground_width_ratio: 0.42,
      center_y_ratio: 0.62,
      product_description: '',
    }));

    reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    reply.raw.writeHead(200);
    sendNdjson(reply, {
      type: 'meta',
      flow: 'v2_product_plus_references',
      num_candidates: numCandidates,
      references_received: references.length,
    });

    // Use reference images directly as backgrounds, cycling as needed.
    for (let i = 0; i < numCandidates; i++) {
      const ref = references[i % references.length];
      const bgPath = path.join(tempDir, `${Date.now()}_refbg_${i}_${ref.filename}`);
      fs.writeFileSync(bgPath, ref.buffer);

      // Ensure square, and keep quality.
      const squareBgPath = path.join(tempDir, `${Date.now()}_refbg_sq_${i}.png`);
      await sharp(bgPath).resize(1080, 1080, { fit: 'cover', position: 'centre' }).png().toFile(squareBgPath);

      const mergedPath = await mergeProductOnBackground({
        productPath,
        backgroundPath: squareBgPath,
        mask,
        outSize: 1080,
        foregroundWidthRatio: orchestration.foreground_width_ratio,
        centerYRatio: orchestration.center_y_ratio,
      });

      const mergedBuf = fs.readFileSync(mergedPath);
      const dataUrl = `data:image/png;base64,${mergedBuf.toString('base64')}`;

      sendNdjson(reply, {
        type: 'candidate',
        candidate_id: `v2_${Date.now()}_${i}`,
        image: {
          path: mergedPath,
          preview_data_url: previewOnly ? dataUrl : undefined,
        },
        debug: { used_reference_filename: ref.filename },
      });
    }

    sendNdjson(reply, { type: 'done' });
    reply.raw.end();
  });
}


