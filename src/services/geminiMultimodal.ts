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

// Cache for the analyzer prompt
let cachedAnalyzerPrompt: string | null = null;

function loadAnalyzerPrompt(): string {
  if (cachedAnalyzerPrompt) {
    return cachedAnalyzerPrompt;
  }

  const promptPath = path.join(process.cwd(), 'reference-library', 'AnalyzerPrompt.md');
  
  if (!fs.existsSync(promptPath)) {
    throw new Error(`AnalyzerPrompt.md not found at: ${promptPath}`);
  }

  const content = fs.readFileSync(promptPath, 'utf-8');
  
  // Extract content between triple backticks in the ## Prompt section
  const promptSectionMatch = content.match(/## Prompt\s*\n\s*```([\s\S]*?)```/);
  
  if (!promptSectionMatch || !promptSectionMatch[1]) {
    throw new Error('Could not extract prompt from AnalyzerPrompt.md');
  }

  cachedAnalyzerPrompt = promptSectionMatch[1].trim();
  return cachedAnalyzerPrompt;
}

export type GeminiKeywordResult = {
  description: string;
  keywords: string[];
};

export type GeminiDesignGuidelinesResult = {
  tags: string[];
  industry: string;
  aesthetic: string;
  mood: string;
  design_guidelines: object;
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

export async function extractDesignGuidelinesWithGemini(params: {
  imagePath: string;
}): Promise<GeminiDesignGuidelinesResult> {
  if (!fs.existsSync(params.imagePath)) throw new Error(`File not found: ${params.imagePath}`);

  const apiKey = requireGeminiApiKey();
  const model = resolveGeminiVisionModel();
  const ai = new GoogleGenAI({ apiKey });

  const buf = fs.readFileSync(params.imagePath);
  const b64 = buf.toString('base64');
  const mime = guessMimeType(params.imagePath);

  // Load the dynamic prompt from AnalyzerPrompt.md
  const systemPrompt = loadAnalyzerPrompt();

  const rsp = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt },
          { text: 'Analyze the image and extract comprehensive design guidelines.' },
          { inlineData: { data: b64, mimeType: mime } },
        ],
      },
    ],
    config: { temperature: 0.2, maxOutputTokens: 2500 },
  });

  const raw = (rsp.text || '').trim();
  const parsed = safeJsonParse<any>(raw);
  
  if (!parsed || typeof parsed !== 'object') {
    logger.warn(`Gemini design guidelines extraction returned non-JSON/invalid. raw="${raw.slice(0, 180)}..."`);
    return {
      tags: [],
      industry: '',
      aesthetic: '',
      mood: '',
      design_guidelines: {},
    };
  }

  // Extract searchable fields from the nested structure
  const overallStyle = parsed.overall_style || {};
  const industryFit = Array.isArray(overallStyle.industry_fit) ? overallStyle.industry_fit : [];
  const industry = industryFit.length > 0 ? String(industryFit[0]).toLowerCase() : '';
  const aesthetic = overallStyle.aesthetic ? String(overallStyle.aesthetic).toLowerCase() : '';
  const mood = overallStyle.mood ? String(overallStyle.mood).toLowerCase() : '';

  // Generate tags from various fields
  const tags: string[] = [];
  
  // Add aesthetic and mood as tags
  if (aesthetic) tags.push(aesthetic);
  if (mood) tags.push(mood);
  
  // Add color palette temperature
  if (parsed.color_palette?.temperature) {
    tags.push(String(parsed.color_palette.temperature).toLowerCase());
  }
  
  // Add layout info
  if (parsed.layout?.product_position) {
    tags.push(String(parsed.layout.product_position).toLowerCase().replace(/-/g, ' '));
  }
  
  // Add background type
  if (parsed.background?.type) {
    tags.push(String(parsed.background.type).toLowerCase());
  }
  
  // Add lighting type
  if (parsed.lighting?.type) {
    tags.push(String(parsed.lighting.type).toLowerCase().replace(/-/g, ' '));
  }

  // Add content-specific tags from content_elements
  const content = parsed.content_elements || {};
  
  // Add people attributes
  if (content.people?.present && content.people.attributes) {
    const attrs = content.people.attributes;
    if (Array.isArray(attrs.hair)) {
      tags.push(...attrs.hair.map((h: any) => String(h).toLowerCase()));
    }
    if (Array.isArray(attrs.facial_features)) {
      tags.push(...attrs.facial_features.map((f: any) => String(f).toLowerCase()));
    }
    if (Array.isArray(attrs.clothing)) {
      tags.push(...attrs.clothing.map((c: any) => String(c).toLowerCase()));
    }
    if (Array.isArray(attrs.expression)) {
      tags.push(...attrs.expression.map((e: any) => String(e).toLowerCase()));
    }
    if (Array.isArray(attrs.body_type)) {
      tags.push(...attrs.body_type.map((b: any) => String(b).toLowerCase()));
    }
  }
  
  // Add people activities
  if (content.people?.activity && Array.isArray(content.people.activity)) {
    tags.push(...content.people.activity.map((a: any) => String(a).toLowerCase()));
  }
  
  // Add objects and props
  if (content.objects_and_props?.present && Array.isArray(content.objects_and_props.items)) {
    tags.push(...content.objects_and_props.items.map((i: any) => String(i).toLowerCase()));
  }
  
  // Add setting details
  if (content.setting?.location) {
    tags.push(String(content.setting.location).toLowerCase());
  }
  if (content.setting?.time_of_day) {
    tags.push(String(content.setting.time_of_day).toLowerCase());
  }
  if (content.setting?.season && content.setting.season !== 'generic') {
    tags.push(String(content.setting.season).toLowerCase());
  }
  if (content.setting?.weather && content.setting.weather !== 'clear') {
    tags.push(String(content.setting.weather).toLowerCase());
  }
  
  // Add lifestyle category
  if (content.action_context?.lifestyle_category && Array.isArray(content.action_context.lifestyle_category)) {
    tags.push(...content.action_context.lifestyle_category.map((l: any) => String(l).toLowerCase()));
  }

  // Add all industries as tags
  tags.push(...industryFit.map((i: any) => String(i).toLowerCase()));

  // Remove duplicates and limit to reasonable number (increased from 20 to 30 for richer keywords)
  const uniqueTags = Array.from(new Set(tags.filter(t => t.length > 0))).slice(0, 30);

  return {
    tags: uniqueTags,
    industry,
    aesthetic,
    mood,
    design_guidelines: parsed,
  };
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


