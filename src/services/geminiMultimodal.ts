import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as logger from '../utils/logger';

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

function resolveGeminiVisionModel(): string {
  // Gemini multimodal model for generateContent.
  return (process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash').trim();
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/jpeg';
}

function normalizeGeminiJson(raw: string): string {
  let s = (raw || '').trim();
  // Strip Markdown code fences like ```json ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

  // If the model included extra text, extract the outermost JSON object.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(normalizeGeminiJson(raw)) as T;
  } catch {
    return null;
  }
}

export type GeminiKeywordResult = {
  description: string;
  keywords: string[];
};

export type GeminiSubjectMaskResult = {
  // Normalized (0..1) bounding box for the primary subject/product.
  bbox: { x: number; y: number; w: number; h: number };
  // Optional polygon points (normalized 0..1). If missing, use bbox.
  polygon?: Array<{ x: number; y: number }>;
};

export async function extractKeywordsWithGemini(params: {
  imagePath: string;
  maxKeywords?: number;
}): Promise<GeminiKeywordResult> {
  if (!fs.existsSync(params.imagePath)) throw new Error(`File not found: ${params.imagePath}`);

  const apiKey = requireGeminiApiKey();
  const model = resolveGeminiVisionModel();
  const ai = new GoogleGenAI({ apiKey });

  const buf = fs.readFileSync(params.imagePath);
  const b64 = buf.toString('base64');
  const mime = guessMimeType(params.imagePath);
  const max = Math.min(Math.max(params.maxKeywords ?? 12, 5), 25);

  const system = [
    'You extract concise stock-photo metadata.',
    'Return ONLY JSON matching this schema:',
    '{ "description": string, "keywords": string[] }',
    `keywords: return ${max} lowercase keywords, no duplicates, no hashtags.`,
    'Focus on scene objects, environment, mood, and style.',
  ].join('\n');

  const rsp = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: system },
          { text: 'Analyze the image and extract description + keywords.' },
          { inlineData: { data: b64, mimeType: mime } },
        ],
      },
    ],
    config: { temperature: 0.2, maxOutputTokens: 280 },
  });

  const raw = (rsp.text || '').trim();
  const parsed = safeJsonParse<{ description?: unknown; keywords?: unknown }>(raw);
  if (!parsed || typeof parsed.description !== 'string' || !Array.isArray(parsed.keywords)) {
    logger.warn(`Gemini keyword extraction returned non-JSON/invalid. raw="${raw.slice(0, 180)}..."`);
    return { description: '', keywords: [] };
  }
  const keywords = parsed.keywords
    .filter((k) => typeof k === 'string')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0)
    .slice(0, max);
  return { description: parsed.description.trim(), keywords: Array.from(new Set(keywords)) };
}

export async function extractSubjectMaskWithGemini(params: {
  imagePath: string;
}): Promise<GeminiSubjectMaskResult | null> {
  if (!fs.existsSync(params.imagePath)) throw new Error(`File not found: ${params.imagePath}`);

  const apiKey = requireGeminiApiKey();
  const model = resolveGeminiVisionModel();
  const ai = new GoogleGenAI({ apiKey });

  const buf = fs.readFileSync(params.imagePath);
  const b64 = buf.toString('base64');
  const mime = guessMimeType(params.imagePath);

  const instruction = [
    'You locate the main product/subject in the image for compositing.',
    'Return ONLY JSON matching this schema:',
    '{',
    '  "bbox": {"x": number, "y": number, "w": number, "h": number},',
    '  "polygon": [{"x": number, "y": number}]',
    '}',
    '- Coordinates must be normalized between 0 and 1.',
    '- bbox must tightly bound the main product/subject.',
    '- polygon is optional but preferred (10-40 points, clockwise).',
    '- Do not include any other keys.',
  ].join('\n');

  const rsp = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: instruction },
          { text: 'Locate the main product/subject.' },
          { inlineData: { data: b64, mimeType: mime } },
        ],
      },
    ],
    config: { temperature: 0.1, maxOutputTokens: 450 },
  });

  const raw = (rsp.text || '').trim();
  const parsed = safeJsonParse<any>(raw);
  if (!parsed || !parsed.bbox) return null;

  const bbox = parsed.bbox;
  const isNum = (n: any) => typeof n === 'number' && Number.isFinite(n);
  if (!isNum(bbox.x) || !isNum(bbox.y) || !isNum(bbox.w) || !isNum(bbox.h)) return null;

  const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
  const out: GeminiSubjectMaskResult = {
    bbox: {
      x: clamp01(bbox.x),
      y: clamp01(bbox.y),
      w: clamp01(bbox.w),
      h: clamp01(bbox.h),
    },
  };
  if (Array.isArray(parsed.polygon)) {
    const pts = parsed.polygon
      .filter((p: any) => p && isNum(p.x) && isNum(p.y))
      .map((p: any) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
    if (pts.length >= 6) out.polygon = pts.slice(0, 48);
  }
  return out;
}


