import OpenAI from 'openai';
import * as logger from '../utils/logger';

export type PixabayQueryResult = {
  keywords: string[];
  query: string;
  lang?: string | null;
  orientation?: 'all' | 'horizontal' | 'vertical';
};

function initOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');
  return new OpenAI({ apiKey });
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clampQuery(q: string): string {
  const cleaned = q.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 100) return cleaned;
  return cleaned.slice(0, 100).trim();
}

function fallbackQuery(prompt: string): PixabayQueryResult {
  // Minimal deterministic fallback: strip punctuation and take a compact query.
  const cleaned = prompt
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean).slice(0, 10);
  const query = clampQuery(words.join(' '));
  return { keywords: words, query, lang: null, orientation: 'all' };
}

/**
 * Build a Pixabay search query from a user prompt (and optional extra context).
 * Returns a short query (<= 100 chars) suitable for Pixabay `q=` parameter.
 *
 * Docs: https://pixabay.com/api/docs/
 */
export async function buildPixabayQuery(params: {
  userPrompt: string;
  extraContext?: string | null;
}): Promise<PixabayQueryResult> {
  const userPrompt = (params.userPrompt || '').trim();
  if (userPrompt.length === 0) throw new Error('User prompt is empty');

  const openai = initOpenAIClient();
  const model = (process.env.PIXABAY_QUERY_MODEL || 'gpt-4o-mini').trim();

  const system = [
    'You extract a concise Pixabay image search query from a marketing prompt.',
    'Return ONLY valid JSON.',
    'Rules:',
    '- Output schema: { "keywords": string[], "query": string, "lang": string|null, "orientation": "all"|"horizontal"|"vertical" }',
    '- query must be <= 100 characters (Pixabay limit), plain words, no quotes.',
    '- Prefer concrete scene keywords (places, weather, objects, environment).',
    '- Avoid brand names/trademarks, user names, and long phrases.',
  ].join('\n');

  const user = [
    `UserPrompt: ${userPrompt}`,
    params.extraContext ? `ExtraContext: ${params.extraContext}` : 'ExtraContext: (none)',
    '',
    'Return JSON now.',
  ].join('\n');

  try {
    const resp = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 180,
      response_format: { type: 'json_object' },
    });

    const raw = resp.choices[0]?.message?.content?.trim() || '';
    const parsed = safeJsonParse<{
      keywords?: unknown;
      query?: unknown;
      lang?: unknown;
      orientation?: unknown;
    }>(raw);

    if (!parsed || typeof parsed.query !== 'string') {
      logger.warn('Pixabay query builder returned invalid JSON; using fallback.');
      return fallbackQuery(userPrompt);
    }

    const keywords =
      Array.isArray(parsed.keywords) ? parsed.keywords.filter((k) => typeof k === 'string').map((k) => k.trim()).filter(Boolean) : [];
    const query = clampQuery(parsed.query);
    const lang = typeof parsed.lang === 'string' ? parsed.lang.trim() : null;
    const orientation =
      parsed.orientation === 'horizontal' || parsed.orientation === 'vertical' || parsed.orientation === 'all'
        ? parsed.orientation
        : 'all';

    if (!query) return fallbackQuery(userPrompt);
    return { keywords, query, lang, orientation };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.warn(`Pixabay query builder failed (${msg}); using fallback.`);
    return fallbackQuery(userPrompt);
  }
}


