import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as logger from '../utils/logger';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function isRateLimitError(err: unknown): boolean {
  // @google/genai errors can vary by runtime; handle common shapes + message content.
  const anyErr = err as any;
  const status = anyErr?.status ?? anyErr?.error?.status;
  const code = anyErr?.code ?? anyErr?.error?.code;
  if (status === 429 || code === 429) return true;

  const msg =
    typeof anyErr?.message === 'string'
      ? anyErr.message
      : typeof anyErr?.error?.message === 'string'
        ? anyErr.error.message
        : '';
  if (!msg) return false;
  return (
    msg.includes('"code":429') ||
    msg.toLowerCase().includes('resource exhausted') ||
    msg.toLowerCase().includes('resource_exhausted') ||
    msg.toLowerCase().includes('rate limit') ||
    msg.toLowerCase().includes('quota')
  );
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  // Default
  return 'image/jpeg';
}

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

function resolveTextModel(): string {
  // Use a model that supports `generateContent` for Gemini API via @google/genai.
  // Users can override via GEMINI_TEXT_MODEL.
  return (process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash').trim();
}

function resolveMaxRetries(): number {
  const n = parsePositiveInt(process.env.GEMINI_REFINE_MAX_RETRIES);
  // total attempts = 1 + retries; keep conservative defaults
  if (!n) return 3;
  return Math.min(Math.max(n, 0), 8);
}

export async function refinePromptWithGemini(params: {
  userPrompt: string;
  pixabayImagePath: string;
  userImagePath?: string | null;
  visionAnalysis?: string | null;
}): Promise<string> {
  const userPrompt = (params.userPrompt || '').trim();
  if (!userPrompt) throw new Error('User prompt is empty');
  if (!params.pixabayImagePath || !fs.existsSync(params.pixabayImagePath)) {
    throw new Error('Pixabay image file not found for Gemini prompt refinement');
  }

  const apiKey = requireGeminiApiKey();
  const model = resolveTextModel();
  const ai = new GoogleGenAI({ apiKey });

  const pixabayBuf = fs.readFileSync(params.pixabayImagePath);
  const pixabayB64 = pixabayBuf.toString('base64');
  const pixabayMime = guessMimeType(params.pixabayImagePath);

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];

  parts.push({
    text: [
      'You refine an image-generation prompt for an Instagram feed post.',
      'You will be given:',
      '- The user prompt (requirements).',
      '- A Pixabay reference image (scene inspiration).',
      '- Optionally, a user-uploaded reference image (product/subject).',
      '- Optionally, a short visual analysis text.',
      '',
      'Rules:',
      '- Output ONLY the final prompt text. No markdown. No quotes.',
      '- The final prompt must describe a square (1:1) Instagram composition. Do not mention pixel dimensions.',
      '- Use the reference images as inspiration, but keep the user’s intent as the priority.',
      '- If the user requests overlay text, include it explicitly in the prompt (e.g., “Include overlay text: ...”).',
      '- Avoid brand/trademarked names unless the user explicitly asked; if asked, keep it literal as overlay text only.',
    ].join('\n'),
  });

  parts.push({ text: `UserPrompt: ${userPrompt}` });
  if (params.visionAnalysis && params.visionAnalysis.trim().length > 0) {
    parts.push({ text: `UserImageAnalysis: ${params.visionAnalysis.trim()}` });
  }

  // Provide images after the text instructions.
  parts.push({ text: 'PixabayReferenceImage:' });
  parts.push({ inlineData: { data: pixabayB64, mimeType: pixabayMime } });

  if (params.userImagePath && fs.existsSync(params.userImagePath)) {
    const userBuf = fs.readFileSync(params.userImagePath);
    const userB64 = userBuf.toString('base64');
    const userMime = guessMimeType(params.userImagePath);
    parts.push({ text: 'UserReferenceImage:' });
    parts.push({ inlineData: { data: userB64, mimeType: userMime } });
  }

  const maxRetries = resolveMaxRetries();
  logger.info(
    `Refining prompt with Gemini (model=${model}) using Pixabay + optional user image context (maxRetries=${maxRetries})`
  );

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          temperature: 0.3,
          maxOutputTokens: 220,
        },
      });

      const refined = (response.text || '').trim();
      if (!refined) throw new Error('Gemini did not return a refined prompt');
      return refined;
    } catch (err) {
      lastError = err;
      const retryable = isRateLimitError(err);
      const remaining = maxRetries - attempt;
      const msg = err instanceof Error ? err.message : 'Unknown error';

      if (!retryable || remaining <= 0) {
        logger.warn(`Gemini prompt refinement failed (attempt=${attempt + 1}/${maxRetries + 1}): ${msg}`);
        break;
      }

      // Exponential backoff: 1s, 2s, 4s... plus small jitter.
      const baseMs = 1000 * Math.pow(2, attempt);
      const jitterMs = Math.floor(Math.random() * 250);
      const waitMs = Math.min(baseMs + jitterMs, 10_000);

      logger.warn(
        `Gemini rate-limited (429). Retrying in ${waitMs}ms (attempt=${attempt + 1}/${maxRetries + 1})`
      );
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini prompt refinement failed');
}


