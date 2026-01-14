import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { GoogleGenAI } from '@google/genai';

type OperationLike = {
  name?: string;
  done?: boolean;
  error?: any;
  response?: any;
  result?: any;
};

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

function resolveVeoModel(): string {
  return (process.env.GEMINI_VEO_MODEL || 'veo-3.1-generate-preview').trim();
}

function getOutputDir(): string {
  const outputDir = path.join(process.cwd(), 'generated-videos');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

function sanitizeForFilename(input: string): string {
  const s = (input || '').trim().slice(0, 80);
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'video';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function appendApiKey(url: string, apiKey: string): string {
  try {
    const u = new URL(url);
    // Add key param if not already present.
    if (!u.searchParams.get('key')) {
      u.searchParams.set('key', apiKey);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchBinary(url: string, apiKey: string): Promise<Buffer> {
  const finalUrl = appendApiKey(url, apiKey);
  const res = await fetch(finalUrl, {
    headers: {
      // Some endpoints accept key in headers; harmless if ignored.
      'x-goog-api-key': apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to download video (HTTP ${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function extractOperationName(op: any): string | null {
  if (op && typeof op === 'object') {
    if (typeof op.name === 'string' && op.name.trim()) return op.name.trim();
    if (typeof op.operation === 'string' && op.operation.trim()) return op.operation.trim();
    if (typeof op.id === 'string' && op.id.trim()) return op.id.trim();
  }
  return null;
}

function isDone(op: any): boolean {
  if (!op) return false;
  if (typeof op.done === 'boolean') return op.done;
  if (typeof op.status === 'string') {
    const s = op.status.toLowerCase();
    return s === 'done' || s === 'succeeded' || s === 'completed';
  }
  return false;
}

function extractVideoUri(op: any): string | null {
  // Try a few known shapes.
  const root = op?.result ?? op?.response ?? op;
  const candidates: any[] = [];
  if (root?.generatedVideos && Array.isArray(root.generatedVideos)) candidates.push(...root.generatedVideos);
  if (root?.generated_videos && Array.isArray(root.generated_videos)) candidates.push(...root.generated_videos);
  if (root?.videos && Array.isArray(root.videos)) candidates.push(...root.videos);

  for (const v of candidates) {
    const maybeVideo = v?.video ?? v;
    const uri = maybeVideo?.uri ?? maybeVideo?.url;
    if (typeof uri === 'string' && uri.toLowerCase().startsWith('https://')) return uri;
  }
  return null;
}

function extractVideoBase64(op: any): string | null {
  const root = op?.result ?? op?.response ?? op;
  const candidates: any[] = [];
  if (root?.generatedVideos && Array.isArray(root.generatedVideos)) candidates.push(...root.generatedVideos);
  if (root?.generated_videos && Array.isArray(root.generated_videos)) candidates.push(...root.generated_videos);
  if (root?.videos && Array.isArray(root.videos)) candidates.push(...root.videos);

  for (const v of candidates) {
    const maybeVideo = v?.video ?? v;
    const b64 = maybeVideo?.videoBytes ?? maybeVideo?.bytes ?? maybeVideo?.data;
    if (typeof b64 === 'string' && b64.length > 0) return b64;
  }
  return null;
}

export async function generateVeoVideo(params: {
  prompt: string;
  productImagePath?: string | null;
  aspectRatio?: '9:16' | '1:1' | '16:9';
  durationSeconds?: number;
  negativePrompt?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}): Promise<{ mp4Path: string; model: string; operationName?: string }> {
  const prompt = (params.prompt || '').trim();
  if (!prompt) throw new Error('Prompt is empty');

  const apiKey = requireGeminiApiKey();
  const model = resolveVeoModel();
  const ai = new GoogleGenAI({ apiKey });

  const pollIntervalMs = Math.max(1000, params.pollIntervalMs ?? 5000);
  const maxPollAttempts = Math.max(1, params.maxPollAttempts ?? 120); // 10 min default

  // Optional input image -> base64 inline data (if supported by the API/model).
  let inputImage: { mimeType: string; imageBytes: string } | null = null;
  if (params.productImagePath) {
    try {
      if (fs.existsSync(params.productImagePath)) {
        const buf = fs.readFileSync(params.productImagePath);
        const b64 = buf.toString('base64');
        // Keep simple: infer from extension; default to image/png.
        const ext = path.extname(params.productImagePath).toLowerCase();
        const mime =
          ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.webp'
              ? 'image/webp'
              : 'image/png';
        inputImage = { mimeType: mime, imageBytes: b64 };
      }
    } catch (e) {
      logger.warn('Failed to read productImagePath for Veo conditioning; falling back to text-only', e);
    }
  }

  logger.info(`Starting Veo video generation (model=${model})...`);

  // We intentionally keep types loose because Veo SDK surface may differ by version.
  const startReq: any = {
    model,
    prompt,
    config: {
      // These fields may be ignored depending on model support; safe to include.
      aspectRatio: params.aspectRatio || '9:16',
      durationSeconds: params.durationSeconds ?? 8,
      negativePrompt: params.negativePrompt,
    },
  };

  if (inputImage) {
    // SDK expects imageBytes + mimeType (it will convert to bytesBase64Encoded internally)
    startReq.image = inputImage;
    // Some versions accept multiple images; keep for compatibility.
    startReq.images = [inputImage];
    startReq.inputImage = inputImage;
  }

  // Try different method names for compatibility.
  let op: OperationLike;
  const modelsAny: any = (ai as any).models;
  if (modelsAny?.generateVideos) {
    op = await modelsAny.generateVideos(startReq);
  } else if (modelsAny?.generate_videos) {
    op = await modelsAny.generate_videos(startReq);
  } else if ((ai as any).generateVideos) {
    op = await (ai as any).generateVideos(startReq);
  } else {
    throw new Error('Veo video generation is not supported by the current @google/genai SDK in this project');
  }

  const operationName = extractOperationName(op);
  if (!operationName) {
    // Some SDKs return the final response directly; try to extract video now.
    const directUri = extractVideoUri(op);
    const directB64 = extractVideoBase64(op);
    if (!directUri && !directB64) {
      throw new Error('Veo did not return an operation name or any downloadable video payload');
    }
  }

  // Poll operation until done (if operationName present).
  let current: any = op;
  if (operationName) {
    const opsAny: any = (ai as any).operations;
    logger.info(`Veo operation name: ${operationName}`);
    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      // Some SDKs expose op.done; others require fetching.
      if (isDone(current)) break;

      if (!opsAny?.get) {
        // If we cannot poll, break and attempt extraction anyway.
        logger.warn('Veo operation polling is not available; attempting to extract video from initial response');
        break;
      }

      logger.info(`Polling Veo operation (attempt ${attempt}/${maxPollAttempts})...`);
      await sleep(pollIntervalMs);
      try {
        // @google/genai@1.33.0 expects: operations.get({ operation: <Operation> })
        // It returns an updated Operation object with refreshed status/result.
        current = await opsAny.get({ operation: current });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Veo operations.get failed: ${msg}`, e);
        throw new Error(`Veo operations.get failed: ${msg}`);
      }
    }

    if (!isDone(current)) {
      throw new Error(`Veo operation did not complete after ${maxPollAttempts} attempts`);
    }

    if (current?.error) {
      const msg =
        typeof current.error?.message === 'string'
          ? current.error.message
          : JSON.stringify(current.error);
      throw new Error(`Veo operation failed: ${msg}`);
    }
  }

  // Extract video payload (prefer URI).
  const uri = extractVideoUri(current);
  const b64 = uri ? null : extractVideoBase64(current);
  if (!uri && !b64) {
    throw new Error('Veo completed but no video URI/bytes were found in the response');
  }

  const outputDir = getOutputDir();
  const ts = Date.now();
  const slug = sanitizeForFilename(prompt);
  const mp4Path = path.join(outputDir, `${ts}_${slug}.mp4`);

  if (uri) {
    logger.info(`Downloading Veo MP4 from URI: ${uri}`);
    const buffer = await fetchBinary(uri, apiKey);
    fs.writeFileSync(mp4Path, buffer);
  } else if (b64) {
    const buffer = Buffer.from(b64, 'base64');
    fs.writeFileSync(mp4Path, buffer);
  }

  logger.info(`Veo video saved: ${mp4Path}`);
  return { mp4Path, model, operationName: operationName ?? undefined };
}


