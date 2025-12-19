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

function resolveMaxRetries(): number {
  const n = parsePositiveInt(process.env.GEMINI_IMAGE_ANALYZER_MAX_RETRIES);
  if (!n) return 3;
  return Math.min(Math.max(n, 0), 8);
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

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

function resolveGeminiVisionModel(): string {
  return (process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash').trim();
}

function guessMimeType(filenameOrPath: string): string {
  const ext = path.extname(filenameOrPath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/jpeg';
}

function normalizeGeminiJson(raw: string): string {
  let s = (raw || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(normalizeGeminiJson(raw)) as T;
  } catch {
    return null;
  }
}

export type ImageAnalyzerUseCase = { use_case: string; question: string };
export type ImageAnalyzerResult = { use_cases: ImageAnalyzerUseCase[] };

function coerceResult(v: any): ImageAnalyzerResult | null {
  if (!v || typeof v !== 'object') return null;
  const arr = Array.isArray(v.use_cases) ? v.use_cases : null;
  if (!arr) return null;
  const cleaned = arr
    .filter((x: any) => x && typeof x.use_case === 'string' && typeof x.question === 'string')
    .map((x: any) => ({ use_case: x.use_case.trim(), question: x.question.trim() }))
    .filter((x: any) => x.use_case.length > 0 && x.question.length > 0);
  if (cleaned.length < 1) return null;
  return { use_cases: cleaned.slice(0, 3) };
}

function loadImageAnalyzerPrompt(): string {
  // Read the markdown prompt from repo (not dist) so it stays editable.
  // When running from dist/, process.cwd() is still repo root in common setups.
  const p = path.join(process.cwd(), 'docs', 'Prompts', 'Image Analyzer.md');
  return fs.readFileSync(p, 'utf8');
}

export async function analyzeInstagramImageUseCases(params: {
  imageBuffer: Buffer;
  filenameHint?: string;
}): Promise<ImageAnalyzerResult> {
  const apiKey = requireGeminiApiKey();
  const model = resolveGeminiVisionModel();
  const ai = new GoogleGenAI({ apiKey });
  const maxRetries = resolveMaxRetries();

  const basePrompt = loadImageAnalyzerPrompt();
  const instruction = [
    basePrompt.trim(),
    '',
    'CRITICAL OUTPUT FORMAT (STRICT):',
    '- Return ONLY valid JSON. No markdown, no backticks, no extra text.',
    '- Schema:',
    '{',
    '  "use_cases": [',
    '    { "use_case": string, "question": string },',
    '    { "use_case": string, "question": string },',
    '    { "use_case": string, "question": string }',
    '  ]',
    '}',
    '- You MUST return exactly 3 items in use_cases.',
    '- use_case MUST be one of the allowed use cases from the prompt (verbatim).',
    '- question MUST be the exact corresponding follow-up question from the prompt (verbatim).',
    '- All strings MUST be in English.',
  ].join('\n');

  const b64 = params.imageBuffer.toString('base64');
  const mime = guessMimeType(params.filenameHint || 'image.jpg');

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rsp = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: instruction },
              { text: 'Analyze this Instagram image and return the JSON object.' },
              { inlineData: { data: b64, mimeType: mime } },
            ],
          },
        ],
        config: { temperature: 0.2, maxOutputTokens: 450 },
      });

      const raw = (rsp.text || '').trim();
      const parsed = safeJsonParse<any>(raw);
      const coerced = coerceResult(parsed);
      if (!coerced || coerced.use_cases.length !== 3) {
        logger.warn(`Gemini image analyzer returned invalid JSON. raw="${raw.slice(0, 260)}..."`);
        throw new Error('Image analysis failed (invalid model output).');
      }
      return coerced;
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt >= maxRetries) break;
      const base = 700 * Math.pow(2, attempt); // 700, 1400, 2800...
      const jitter = Math.floor(Math.random() * 350);
      const waitMs = Math.min(12000, base + jitter);
      logger.warn(`Gemini image analyzer rate-limited (429). Retrying in ${waitMs}ms (attempt=${attempt + 1}/${maxRetries + 1})`);
      await sleep(waitMs);
    }
  }

  if (isRateLimitError(lastErr)) {
    const err: any = new Error('Gemini is temporarily rate-limited. Please retry in a moment.');
    err.statusCode = 429;
    throw err;
  }
  throw lastErr instanceof Error ? lastErr : new Error('Image analysis failed.');
}


