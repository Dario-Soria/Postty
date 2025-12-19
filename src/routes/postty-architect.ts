import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import OpenAI from 'openai';
import * as logger from '../utils/logger';
import { POSTTY_MEGA_PROMPT_V10 } from '../prompts/posttyMegaPromptV10';
import { analyzeImageWithVision } from '../services/imageAnalyzer';
import { extractStyleProfileFromReferences, StyleProfile } from '../services/geminiStyleProfile';
import { saveReferenceImageAsync } from '../services/referenceLibrarySqlite';
import * as fs from 'fs';
import * as path from 'path';

type ArchitectState = 'chatting' | 'awaiting_references' | 'generating_options' | 'refining';

type PosttyOption = {
  option_id: number;
  creative_angle: string;
  scenario: 1 | 2 | 3 | 4;
  format: 'instagram_reel' | 'instagram_feed_post';
  visual_description: string;
  text_overlay: { text: string; position: 'top' | 'center' | 'middle-top'; animation: string };
  copywriting: { hook: string; body: string; cta: string };
  hashtags: string[];
  audio_suggestion: string;
};

type PosttyV10Response = {
  state: ArchitectState;
  selected_option_id: number | null;
  chat_response: string;
  content_options: PosttyOption[];
};

type ArchitectMode = 'chatting' | 'generate_3' | 'refine';

type ArchitectJsonBody = {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: ArchitectMode;
  selected_option_id?: number;
  // Optional: pass last options so refine has full context in stateless mode.
  last_content_options?: PosttyOption[];
  // Optional: allow callers to explicitly signal photo presence even if no upload in this request.
  has_photo?: boolean;
  // Reference upload gate
  skip_references?: boolean;
  // Persisted style profile from prior step (so refine stays consistent)
  style_profile?: StyleProfile;
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

function isArchitectState(v: unknown): v is ArchitectState {
  return v === 'chatting' || v === 'awaiting_references' || v === 'generating_options' || v === 'refining';
}

function validateV10Payload(payload: any): { ok: true; value: PosttyV10Response } | { ok: false; reason: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload_not_object' };
  if (!isArchitectState(payload.state)) return { ok: false, reason: 'invalid_state' };
  if (typeof payload.chat_response !== 'string') return { ok: false, reason: 'invalid_chat_response' };

  const sel = payload.selected_option_id;
  if (!(sel === null || (typeof sel === 'number' && Number.isFinite(sel)))) {
    return { ok: false, reason: 'invalid_selected_option_id' };
  }

  const options = payload.content_options;
  if (!Array.isArray(options)) return { ok: false, reason: 'content_options_not_array' };

  const expectedLen =
    payload.state === 'chatting' ? 0 :
    payload.state === 'awaiting_references' ? 0 :
    payload.state === 'generating_options' ? 3 :
    1;
  if (options.length !== expectedLen) {
    return { ok: false, reason: `content_options_length_${options.length}_expected_${expectedLen}` };
  }

  // Light validation per option; keep permissive so the model can evolve.
  for (const opt of options) {
    if (!opt || typeof opt !== 'object') return { ok: false, reason: 'option_not_object' };
    if (typeof opt.option_id !== 'number') return { ok: false, reason: 'option_id_invalid' };
    if (typeof opt.creative_angle !== 'string') return { ok: false, reason: 'creative_angle_invalid' };
    if (typeof opt.visual_description !== 'string') return { ok: false, reason: 'visual_description_invalid' };
    if (!opt.copywriting || typeof opt.copywriting !== 'object') return { ok: false, reason: 'copywriting_invalid' };
    if (!Array.isArray(opt.hashtags)) return { ok: false, reason: 'hashtags_invalid' };
  }

  return { ok: true, value: payload as PosttyV10Response };
}

function computeIsReady(chatResponse: string): boolean {
  const r = (chatResponse || '').toLowerCase();
  // From the PDF: “Estoy listo cuando quieras generarlo.”
  if (r.includes('estoy listo')) return true;
  if (r.includes('listo cuando quieras')) return true;
  return false;
}

function normalizeHistory(history: any): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0)
    .slice(-18);
}

function buildArchitectSystemPrompt(): string {
  // Wrapper ensures the model adheres to the exact JSON schema and strict output rules.
  return [
    POSTTY_MEGA_PROMPT_V10,
    '',
    'CRITICAL OUTPUT RULES (OVERRIDE):',
    '- Output MUST be STRICT JSON. No markdown, no commentary, no backticks.',
    '- Output MUST match the JSON structure in the prompt exactly.',
    '- All user-facing strings MUST be Spanish.',
    '- For state="chatting", content_options MUST be [].',
    '- For state="generating_options", content_options MUST have exactly 3 items with option_id 1,2,3.',
    '- For state="refining", content_options MUST have exactly 1 item and selected_option_id MUST equal the refined option_id.',
    '',
  ].join('\n');
}

function buildUserPayload(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  imageAnalysis: string | null;
  hasPhoto: boolean;
  styleProfile: StyleProfile | null;
  mode: ArchitectMode;
  selectedOptionId: number | null;
  lastOptions?: PosttyOption[] | null;
}): string {
  const flags: string[] = [];
  if (!params.hasPhoto) flags.push('[NO_PHOTO]');
  if (params.mode === 'generate_3') flags.push('[TRIGGER_GENERATE_3]');
  if (params.mode === 'refine') {
    flags.push('[TRIGGER_GENERATE_FINAL]');
    if (params.selectedOptionId != null) flags.push(`[SELECTED_OPTION:${params.selectedOptionId}]`);
  }

  const historyBlock =
    params.history.length > 0
      ? params.history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
      : '(empty)';

  const optionsBlock =
    params.lastOptions && params.lastOptions.length > 0
      ? JSON.stringify(params.lastOptions, null, 2)
      : '(none)';

  return [
    'HISTORY:',
    historyBlock,
    '',
    params.imageAnalysis ? `IMAGE_CONTEXT:\n${params.imageAnalysis}` : 'IMAGE_CONTEXT: (none)',
    '',
    params.styleProfile ? `REFERENCE_STYLE_PROFILE_JSON:\n${JSON.stringify(params.styleProfile, null, 2)}` : 'REFERENCE_STYLE_PROFILE_JSON: (none)',
    '',
    `MODE: ${params.mode}`,
    params.selectedOptionId != null ? `SELECTED_OPTION_ID: ${params.selectedOptionId}` : 'SELECTED_OPTION_ID: (none)',
    '',
    'LAST_GENERATED_OPTIONS (if any):',
    optionsBlock,
    '',
    `USER_MESSAGE: ${params.message}`,
    '',
    `SYSTEM_FLAGS: ${flags.join(' ')}`.trim(),
  ].join('\n');
}

async function readMultipartArchitectRequest(request: FastifyRequest): Promise<{
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode: ArchitectMode;
  selectedOptionId: number | null;
  hasPhoto: boolean;
  lastOptions: PosttyOption[] | null;
  skipReferences: boolean;
  styleProfile: StyleProfile | null;
  tempImagePath: string | null;
  tempReferencePaths: string[];
}> {
  const parts = (request as any).parts?.();
  if (!parts) throw new Error('Multipart request expected but parts() is not available');

  let imageBuffer: Buffer | null = null;
  let imageFilename: string | null = null;
  let imageMimetype: string | null = null;

  let message: string | null = null;
  let historyRaw: string | null = null;
  let modeRaw: string | null = null;
  let selectedOptionRaw: string | null = null;
  let hasPhotoRaw: string | null = null;
  let lastOptionsRaw: string | null = null;
  let skipReferencesRaw: string | null = null;
  let styleProfileRaw: string | null = null;

  const referenceFiles: Array<{ buffer: Buffer; filename: string; mimetype: string }> = [];

  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname === 'image') {
        imageBuffer = await part.toBuffer();
        imageFilename = part.filename;
        imageMimetype = part.mimetype;
      } else if (part.fieldname === 'references' || part.fieldname === 'reference') {
        const buf = await part.toBuffer();
        referenceFiles.push({
          buffer: buf,
          filename: part.filename || 'reference',
          mimetype: part.mimetype || 'application/octet-stream',
        });
      }
    } else {
      const v = part.value as any;
      if (part.fieldname === 'message') message = String(v);
      else if (part.fieldname === 'history') historyRaw = String(v);
      else if (part.fieldname === 'mode') modeRaw = String(v);
      else if (part.fieldname === 'selected_option_id') selectedOptionRaw = String(v);
      else if (part.fieldname === 'has_photo') hasPhotoRaw = String(v);
      else if (part.fieldname === 'last_content_options') lastOptionsRaw = String(v);
      else if (part.fieldname === 'skip_references') skipReferencesRaw = String(v);
      else if (part.fieldname === 'style_profile') styleProfileRaw = String(v);
    }
  }

  const trimmedMessage = (message || '').trim();
  if (!trimmedMessage) throw new Error('Missing or invalid "message" field');

  const mode: ArchitectMode = modeRaw === 'generate_3' ? 'generate_3' : modeRaw === 'refine' ? 'refine' : 'chatting';

  const selectedOptionId =
    selectedOptionRaw != null && selectedOptionRaw.trim().length > 0 ? Number(selectedOptionRaw) : null;
  const normalizedSelected = Number.isFinite(selectedOptionId as any) ? (selectedOptionId as number) : null;

  if (mode === 'refine' && normalizedSelected == null) {
    throw new Error('Missing selected_option_id for refine mode');
  }

  const historyParsed = historyRaw ? safeJsonParse<any>(historyRaw) : null;
  const history = normalizeHistory(historyParsed);

  const lastOptionsParsed = lastOptionsRaw ? safeJsonParse<any>(lastOptionsRaw) : null;
  const lastOptions =
    Array.isArray(lastOptionsParsed) ? (lastOptionsParsed as PosttyOption[]) : null;

  const hasPhotoExplicit =
    hasPhotoRaw != null ? String(hasPhotoRaw).trim().toLowerCase() : '';
  const hasPhoto =
    imageBuffer != null ||
    hasPhotoExplicit === 'true' ||
    hasPhotoExplicit === '1' ||
    hasPhotoExplicit === 'yes';

  const skipReferencesExplicit = (skipReferencesRaw || '').trim().toLowerCase();
  const skipReferences = skipReferencesExplicit === 'true' || skipReferencesExplicit === '1' || skipReferencesExplicit === 'yes';
  const styleProfileParsed = styleProfileRaw ? safeJsonParse<any>(styleProfileRaw) : null;
  const styleProfile = (styleProfileParsed && typeof styleProfileParsed === 'object') ? (styleProfileParsed as StyleProfile) : null;

  let tempImagePath: string | null = null;
  if (imageBuffer && imageFilename && imageMimetype) {
    if (!imageMimetype.startsWith('image/')) throw new Error(`Invalid file type: ${imageMimetype}`);
    const tempDir = path.join(process.cwd(), 'temp-uploads');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ts = Date.now();
    const ext = imageFilename.split('.').pop() || 'jpg';
    tempImagePath = path.join(tempDir, `${ts}_postty_architect.${ext}`);
    fs.writeFileSync(tempImagePath, imageBuffer);
  }

  const tempReferencePaths: string[] = [];
  if (referenceFiles.length > 0) {
    const tempDir = path.join(process.cwd(), 'temp-uploads', 'references');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ts = Date.now();
    for (let i = 0; i < referenceFiles.length; i++) {
      const rf = referenceFiles[i];
      if (!rf.mimetype.startsWith('image/')) continue;
      const ext = rf.filename.split('.').pop() || 'jpg';
      const p = path.join(tempDir, `${ts}_ref_${i + 1}.${ext}`);
      fs.writeFileSync(p, rf.buffer);
      tempReferencePaths.push(p);

      // Fire-and-forget: index into SQLite without blocking flow.
      void saveReferenceImageAsync({ buffer: rf.buffer, originalFilename: rf.filename, mime: rf.mimetype });
    }
  }

  return {
    message: trimmedMessage,
    history,
    mode,
    selectedOptionId: normalizedSelected,
    hasPhoto,
    lastOptions,
    skipReferences,
    styleProfile,
    tempImagePath,
    tempReferencePaths,
  };
}

/**
 * Registers the /postty-architect route with the Fastify instance.
 *
 * This endpoint implements the PDF “Content Architect” flow:
 * - chatting → generating_options → refining
 * - uses flags: [NO_PHOTO], [TRIGGER_GENERATE_3], [TRIGGER_GENERATE_FINAL], [SELECTED_OPTION:X]
 * - returns model output as strict JSON payload, plus a small API wrapper with is_ready.
 */
export default async function posttyArchitectRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/postty-architect', async (request: FastifyRequest, reply: FastifyReply) => {
    let tempImagePath: string | null = null;
    let tempReferencePaths: string[] = [];
    try {
      const ct = String((request.headers as any)?.['content-type'] || '').toLowerCase();

      let body: ArchitectJsonBody | null = null;
      let message: string;
      let history: Array<{ role: 'user' | 'assistant'; content: string }>;
      let mode: ArchitectMode;
      let selectedOptionId: number | null;
      let hasPhoto: boolean;
      let lastOptions: PosttyOption[] | null;
      let skipReferences: boolean;
      let styleProfile: StyleProfile | null;

      if (ct.includes('multipart/form-data')) {
        const parsed = await readMultipartArchitectRequest(request);
        message = parsed.message;
        history = parsed.history;
        mode = parsed.mode;
        selectedOptionId = parsed.selectedOptionId;
        hasPhoto = parsed.hasPhoto;
        lastOptions = parsed.lastOptions;
        tempImagePath = parsed.tempImagePath;
        tempReferencePaths = parsed.tempReferencePaths;
        skipReferences = parsed.skipReferences;
        styleProfile = parsed.styleProfile;
      } else {
        body = (request.body ?? null) as any;
        const rawMessage = (body?.message ?? '').toString();
        message = rawMessage.trim();
        if (!message) {
          return reply.status(400).send({ status: 'error', message: 'Missing or invalid "message" field' });
        }
        history = normalizeHistory(body?.history);
        mode = body?.mode === 'generate_3' ? 'generate_3' : body?.mode === 'refine' ? 'refine' : 'chatting';
        selectedOptionId =
          typeof body?.selected_option_id === 'number' && Number.isFinite(body.selected_option_id)
            ? body.selected_option_id
            : null;
        if (mode === 'refine' && selectedOptionId == null) {
          return reply.status(400).send({ status: 'error', message: 'Missing selected_option_id for refine mode' });
        }
        hasPhoto = !!body?.has_photo;
        lastOptions = Array.isArray(body?.last_content_options) ? (body?.last_content_options as PosttyOption[]) : null;
        skipReferences = !!body?.skip_references;
        styleProfile = (body?.style_profile && typeof body.style_profile === 'object') ? (body.style_profile as StyleProfile) : null;
      }

      // Reference gate: before generating the final 3 options, ask for reference images (optional).
      // If none were provided and not explicitly skipped, return a deterministic awaiting_references payload.
      const hasRefsThisRequest = tempReferencePaths.length > 0;
      if (mode === 'generate_3' && !hasRefsThisRequest && !skipReferences && !styleProfile) {
        const gate: PosttyV10Response = {
          state: 'awaiting_references',
          selected_option_id: null,
          chat_response:
            'Antes de generar las 3 opciones: ¿tienes imágenes de referencia (estilo/campaña) para que respete colores, tipografía, composición y vibe? Puedes subir todas las que quieras o tocar “Saltar”.',
          content_options: [],
        };
        return reply.status(200).send({ status: 'success', payload: gate, is_ready: false, needs_references: true });
      }

      // Image context (if photo uploaded in this request)
      let imageAnalysis: string | null = null;
      if (tempImagePath) {
        try {
          imageAnalysis = await analyzeImageWithVision(tempImagePath);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          logger.warn(`postty-architect: image analysis failed (${msg}); proceeding without image context.`);
          imageAnalysis = null;
        }
      }

      // If we have reference images, extract a strict style profile (required to influence output).
      // SQLite indexing happens in parallel (fire-and-forget) inside multipart parsing.
      if (!styleProfile && tempReferencePaths.length > 0) {
        try {
          styleProfile = await extractStyleProfileFromReferences({ imagePaths: tempReferencePaths, maxImages: 6, language: 'es' });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          logger.warn(`postty-architect: style profile extraction failed (${msg}); proceeding without style profile.`);
          styleProfile = null;
        }
      }

      const openai = initOpenAIClient();
      const model = (process.env.POSTTY_ARCHITECT_MODEL || 'gpt-4o-mini').trim();

      const system = buildArchitectSystemPrompt();
      const user = buildUserPayload({
        message,
        history,
        imageAnalysis,
        hasPhoto,
        styleProfile,
        mode,
        selectedOptionId,
        lastOptions,
      });

      logger.info(`postty-architect request (mode=${mode}, hasPhoto=${hasPhoto}, selected=${selectedOptionId ?? 'null'})`);

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 1100,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content?.trim() || '';
      const parsed = safeJsonParse<any>(raw);
      const validated = validateV10Payload(parsed);

      if (!validated.ok) {
        logger.error('postty-architect invalid JSON payload from model:', validated.reason, raw);
        const fallback: PosttyV10Response = {
          state: 'chatting',
          selected_option_id: null,
          chat_response:
            'Hubo un problema generando el contenido. ¿Puedes repetirlo en una frase y decirme el objetivo (vender, educar o viralizar)?',
          content_options: [],
        };
        return reply.status(200).send({ status: 'success', payload: fallback, is_ready: false });
      }

      const payload = validated.value;
      const isReady = payload.state === 'chatting' && computeIsReady(payload.chat_response);

      return reply.status(200).send({
        status: 'success',
        payload,
        is_ready: isReady,
        style_profile: styleProfile,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error occurred';
      logger.error('Error in /postty-architect:', msg);
      return reply.status(500).send({ status: 'error', message: msg });
    } finally {
      if (tempImagePath && fs.existsSync(tempImagePath)) {
        try {
          fs.unlinkSync(tempImagePath);
        } catch {
          // ignore
        }
      }
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


