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

export type StyleProfile = {
  palette_hex: string[]; // 5..8
  typography: {
    headline: string;
    body: string;
    accent?: string;
    weights?: string[];
  };
  composition: {
    layout_motifs: string[];
    negative_space: string;
    text_block_placement: string[];
  };
  imagery_style: {
    medium: 'photo' | 'illustration' | 'mixed' | 'unknown';
    lighting: string;
    texture_grain: string;
    color_grading: string;
  };
  brand_cues: {
    logo_usage: 'yes' | 'no' | 'unknown';
    iconography: string[];
  };
  do: string[];
  dont: string[];
};

function normalizeHex(c: string): string | null {
  const s = c.trim().toUpperCase();
  const m = s.match(/^#?[0-9A-F]{6}$/);
  if (!m) return null;
  return s.startsWith('#') ? s : `#${s}`;
}

function coerceProfile(v: any): StyleProfile | null {
  if (!v || typeof v !== 'object') return null;
  const palette = Array.isArray(v.palette_hex) ? v.palette_hex.filter((x: any) => typeof x === 'string') : [];
  const palette_hex = palette.map(normalizeHex).filter((x: any) => !!x) as string[];
  const typography = v.typography && typeof v.typography === 'object' ? v.typography : null;
  const composition = v.composition && typeof v.composition === 'object' ? v.composition : null;
  const imagery_style = v.imagery_style && typeof v.imagery_style === 'object' ? v.imagery_style : null;
  const brand_cues = v.brand_cues && typeof v.brand_cues === 'object' ? v.brand_cues : null;
  const doArr = Array.isArray(v.do) ? v.do.filter((x: any) => typeof x === 'string') : [];
  const dontArr = Array.isArray(v.dont) ? v.dont.filter((x: any) => typeof x === 'string') : [];

  if (!typography || typeof typography.headline !== 'string' || typeof typography.body !== 'string') return null;
  if (!composition || !Array.isArray(composition.layout_motifs)) return null;
  if (!imagery_style || typeof imagery_style.medium !== 'string') return null;
  if (!brand_cues || typeof brand_cues.logo_usage !== 'string') return null;

  const medium =
    imagery_style.medium === 'photo' || imagery_style.medium === 'illustration' || imagery_style.medium === 'mixed'
      ? imagery_style.medium
      : 'unknown';

  return {
    palette_hex: palette_hex.slice(0, 8),
    typography: {
      headline: String(typography.headline),
      body: String(typography.body),
      accent: typeof typography.accent === 'string' ? typography.accent : undefined,
      weights: Array.isArray(typography.weights) ? typography.weights.filter((x: any) => typeof x === 'string') : undefined,
    },
    composition: {
      layout_motifs: composition.layout_motifs.filter((x: any) => typeof x === 'string').slice(0, 12),
      negative_space: typeof composition.negative_space === 'string' ? composition.negative_space : '',
      text_block_placement: Array.isArray(composition.text_block_placement)
        ? composition.text_block_placement.filter((x: any) => typeof x === 'string').slice(0, 8)
        : [],
    },
    imagery_style: {
      medium,
      lighting: typeof imagery_style.lighting === 'string' ? imagery_style.lighting : '',
      texture_grain: typeof imagery_style.texture_grain === 'string' ? imagery_style.texture_grain : '',
      color_grading: typeof imagery_style.color_grading === 'string' ? imagery_style.color_grading : '',
    },
    brand_cues: {
      logo_usage: brand_cues.logo_usage === 'yes' || brand_cues.logo_usage === 'no' ? brand_cues.logo_usage : 'unknown',
      iconography: Array.isArray(brand_cues.iconography)
        ? brand_cues.iconography.filter((x: any) => typeof x === 'string').slice(0, 10)
        : [],
    },
    do: doArr.slice(0, 12),
    dont: dontArr.slice(0, 12),
  };
}

export async function extractStyleProfileFromReferences(params: {
  imagePaths: string[];
  maxImages?: number;
  language?: string; // "en" | "es" | etc (best-effort)
}): Promise<StyleProfile | null> {
  const imagePaths = (params.imagePaths || []).filter((p) => typeof p === 'string' && p.length > 0);
  if (imagePaths.length === 0) return null;

  const maxImages = Math.min(Math.max(params.maxImages ?? 6, 1), 10);
  const used = imagePaths.slice(0, maxImages).filter((p) => fs.existsSync(p));
  if (used.length === 0) return null;

  const apiKey = requireGeminiApiKey();
  const model = resolveGeminiVisionModel();
  const ai = new GoogleGenAI({ apiKey });

  const lang = (params.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
  const langInstruction =
    lang === 'es' ? 'Todos los valores string DEBEN estar escritos en español.' : 'All string values MUST be written in English.';

  const instruction = [
    'You are a brand/style extractor for ad creatives.',
    'Goal: infer STRICT style constraints from reference images: colors, typography, composition, and imagery style.',
    langInstruction,
    'Return ONLY strict JSON matching this schema:',
    '{',
    '  "palette_hex": ["#RRGGBB", ...],',
    '  "typography": { "headline": string, "body": string, "accent": string, "weights": string[] },',
    '  "composition": { "layout_motifs": string[], "negative_space": string, "text_block_placement": string[] },',
    '  "imagery_style": { "medium": "photo"|"illustration"|"mixed"|"unknown", "lighting": string, "texture_grain": string, "color_grading": string },',
    '  "brand_cues": { "logo_usage": "yes"|"no"|"unknown", "iconography": string[] },',
    '  "do": string[],',
    '  "dont": string[]',
    '}',
    '- palette_hex: 5-8 dominant brand colors in hex (#RRGGBB).',
    '- typography: do NOT hallucinate exact font family names unless clearly recognizable; prefer descriptors (e.g. \"bold geometric sans\", \"condensed sans\", \"serif headline\").',
    '- composition: capture spacing, text hierarchy, common placements, and layout patterns.',
    '- do/dont: concrete, actionable constraints that would change the generated output.',
    '- No markdown, no backticks, no extra keys.',
  ].join('\n');

  const parts: any[] = [{ text: instruction }, { text: `Analyze these ${used.length} reference images and produce ONE merged style profile.` }];
  for (const p of used) {
    const buf = fs.readFileSync(p);
    parts.push({ inlineData: { data: buf.toString('base64'), mimeType: guessMimeType(p) } });
  }

  const rsp = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { temperature: 0.2, maxOutputTokens: 800 },
  });

  const raw = (rsp.text || '').trim();
  const parsed = safeJsonParse<any>(raw);
  const prof = coerceProfile(parsed);
  if (!prof) {
    logger.warn(`Gemini style profile returned invalid JSON. raw="${raw.slice(0, 220)}..."`);
    return null;
  }

  if (prof.palette_hex.length < 3) {
    logger.warn('Gemini style profile palette too small; ignoring style profile.');
    return null;
  }

  return prof;
}


