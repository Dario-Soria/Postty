import { GoogleGenAI } from '@google/genai';
import * as logger from '../utils/logger';

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

function resolveGeminiTextModel(): string {
  return (process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash').trim();
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

export type V2OrchestrationResult = {
  background_prompt: string;
  foreground_width_ratio: number; // 0..1
  center_y_ratio: number; // 0..1
  product_description?: string;
};

export async function orchestrateV2Prompt(params: {
  userPrompt: string;
  productDescription?: string;
  referenceStyleHints?: string;
}): Promise<V2OrchestrationResult> {
  const apiKey = requireGeminiApiKey();
  const model = resolveGeminiTextModel();
  const ai = new GoogleGenAI({ apiKey });

  const system = [
    'You are Postty V2 prompt orchestrator for image generation.',
    'Hard requirements:',
    '- Return ONLY strict JSON matching this schema:',
    '{',
    '  "background_prompt": string,',
    '  "foreground_width_ratio": number,',
    '  "center_y_ratio": number,',
    '  "product_description": string',
    '}',
    '- The background_prompt MUST be in the same language as the userPrompt.',
    '- background_prompt should describe ONLY the background scene (no product pasted/inserted language).',
    '- Keep the user intent; do not sanitize or rephrase unless necessary for safety.',
    '- foreground_width_ratio: 0.25..0.60 (how big the product appears).',
    '- center_y_ratio: 0.45..0.75 (vertical placement).',
  ].join('\n');

  const user = [
    `userPrompt:\n${params.userPrompt}`,
    params.productDescription ? `\nproductDescription:\n${params.productDescription}` : '',
    params.referenceStyleHints ? `\nreferenceStyleHints:\n${params.referenceStyleHints}` : '',
  ].join('\n');

  const rsp = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: system }, { text: user }] }],
    config: { temperature: 0.35, maxOutputTokens: 500 },
  });

  const raw = (rsp.text || '').trim();
  const parsed = safeJsonParse<any>(raw);
  if (!parsed || typeof parsed.background_prompt !== 'string') {
    logger.warn(`V2 orchestrator returned invalid JSON. raw="${raw.slice(0, 220)}..."`);
    return {
      background_prompt: params.userPrompt,
      foreground_width_ratio: 0.42,
      center_y_ratio: 0.62,
      product_description: params.productDescription || '',
    };
  }

  const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
  const fwr =
    typeof parsed.foreground_width_ratio === 'number' ? clamp(parsed.foreground_width_ratio, 0.25, 0.6) : 0.42;
  const cy = typeof parsed.center_y_ratio === 'number' ? clamp(parsed.center_y_ratio, 0.45, 0.75) : 0.62;
  const pd = typeof parsed.product_description === 'string' ? parsed.product_description : params.productDescription || '';

  return {
    background_prompt: parsed.background_prompt.trim() || params.userPrompt,
    foreground_width_ratio: fwr,
    center_y_ratio: cy,
    product_description: pd,
  };
}


