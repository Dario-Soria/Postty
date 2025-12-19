import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import OpenAI from 'openai';
import * as logger from '../utils/logger';

type ChatDecision = 'reject' | 'respond' | 'ask_missing' | 'ready';
type ChatMode = 'new' | 'regenerate';

type ChatState = {
  language?: string | null;
  imageStyle?: string | null;
  useCase?: string | null;
};

type ChatRequestBody = {
  message: string;
  state?: ChatState;
  has_reference_image?: boolean;
  mode?: ChatMode;
  base_prompt?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

type ChatAction =
  | {
      type: 'generate';
      endpoint: 'generate' | 'generate-with-image';
      prompt: string;
    }
  | undefined;

type EventOverlay = {
  title: string | null;
  datePhrase: string | null;
  timePhrase: string | null;
  locationPhrase: string | null;
};

function generationStartingReply(language: string | null | undefined): string {
  const l = (language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  if (l === 'es') return 'Perfecto — estoy generando tu imagen ahora.';
  return 'Great — generating your image now.';
}

function looksLikeEventPosterRequest(message: string, useCase: string | null | undefined): boolean {
  const m = (message || '').toLowerCase();
  const uc = (useCase || '').toLowerCase();
  const useCaseHints = uc.includes('event') || uc.includes('evento') || uc.includes('announcement') || uc.includes('anuncio');
  const msgEventHints =
    m.includes('event') ||
    m.includes('evento') ||
    m.includes('meetup') ||
    m.includes('gathering') ||
    m.includes('run') ||
    m.includes('running') ||
    m.includes('carrera');
  const hasTime = /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(m) || /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(m);
  const hasAtLocation = /\b(at|en)\s+[^.,\n]{2,}/i.test(message);
  return useCaseHints || (msgEventHints && hasTime && hasAtLocation);
}

function extractEventOverlay(message: string, language: string | null | undefined): EventOverlay {
  const m = (message || '').trim();
  const lower = m.toLowerCase();
  const l = (language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';

  // Time (verbatim)
  const timeMatch =
    m.match(/\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i) ??
    m.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  const timePhrase = timeMatch ? timeMatch[0].trim() : null;

  // Location (verbatim-ish, extracted from "at <...>" / "en <...>")
  const locMatch =
    m.match(/\b(?:at|en)\s+([^.,\n]+?)(?=(\s+(we|we'll|we will|nos|nosotros|gather|gathering)\b|[.\n,]|$))/i) ??
    m.match(/\b(?:at|en)\s+([^.,\n]+)$/i);
  const locationPhrase = locMatch?.[1] ? locMatch[1].trim() : null;

  // Date phrase: keep verbatim phrasing if we can extract a "for ... at ..." span.
  let datePhrase: string | null = null;
  const forIdx = lower.indexOf('for ');
  const paraIdx = lower.indexOf('para ');
  const anchorIdx = forIdx >= 0 ? forIdx : paraIdx >= 0 ? paraIdx : -1;
  if (anchorIdx >= 0) {
    const after = m.slice(anchorIdx + (forIdx >= 0 ? 4 : 5));
    const afterLower = after.toLowerCase();
    const atIdx = afterLower.indexOf(' at ');
    const enIdx = afterLower.indexOf(' en ');
    const cutIdx = atIdx >= 0 ? atIdx : enIdx >= 0 ? enIdx : -1;
    const candidate = (cutIdx >= 0 ? after.slice(0, cutIdx) : after).trim();
    if (candidate.length > 0) datePhrase = candidate;
  }

  // Title: try to extract an explicit name, else infer a safe generic (no placeholders).
  let title: string | null = null;
  const namedMatch =
    m.match(/\b(?:called|named)\s+["“”']?([^"“”'\n,.]+)["“”']?/i) ??
    m.match(/\b(?:se\s+llama|llamado|llamada)\s+["“”']?([^"“”'\n,.]+)["“”']?/i);
  if (namedMatch?.[1]) {
    title = namedMatch[1].trim();
  } else if (/\brunning\b|\brun\b|\bcarrera\b/i.test(m)) {
    title = l === 'es' ? 'Evento de running' : 'Running Event';
  } else if (/\bevent\b|\bevento\b/i.test(m)) {
    title = l === 'es' ? 'Evento' : 'Event';
  }

  return { title, datePhrase, timePhrase, locationPhrase };
}

function buildOnImageTextBlock(overlay: EventOverlay, language: string | null | undefined): string | null {
  const l = (language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  const lines: string[] = [];

  if (!overlay.title && !overlay.datePhrase && !overlay.timePhrase && !overlay.locationPhrase) return null;

  lines.push('ON_IMAGE_TEXT (MUST INCLUDE VERBATIM):');
  if (overlay.title) lines.push(`- Title: ${overlay.title}`);
  if (overlay.datePhrase) lines.push(`- Date: ${overlay.datePhrase}`);
  if (overlay.timePhrase) lines.push(`- Time: ${overlay.timePhrase}`);
  if (overlay.locationPhrase) lines.push(`- Location: ${overlay.locationPhrase}`);
  lines.push('');
  lines.push('RULES (STRICT):');
  lines.push('- Do NOT use placeholders (e.g. "EVENT NAME", "[Date]", "[Location]", "CITY, STATE").');
  lines.push('- Do NOT invent or substitute different dates/times/locations.');
  lines.push('- Keep the spelling/case of the provided strings as-is.');
  lines.push('- Make the text large, legible, bold sans-serif, short lines, high contrast.');
  lines.push('- Clear hierarchy: Title largest, then date/time, then location.');
  if (l === 'es') {
    lines.push('- Asegura legibilidad del texto y alto contraste.');
  }

  return lines.join('\n');
}

function initOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');
  return new OpenAI({ apiKey });
}

function looksLikeInspirationRequest(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('inspiration') ||
    m.includes('ideas') ||
    m.includes('idea') ||
    m.includes('inspiración') ||
    m.includes('inspiracion') ||
    m.includes('ideas e inspiración') ||
    m.includes('ideas e inspiracion')
  );
}

function detectLanguageFromUserMessage(message: string): string {
  // Lightweight heuristic; avoids an extra LLM call and prevents "what language?" follow-ups.
  // If it looks Spanish, return "es", otherwise default to "en".
  const m = message.toLowerCase();
  const hasSpanishChars = /[áéíóúñü¿¡]/i.test(message);
  const spanishHints = [
    ' en español',
    ' español',
    ' castellano',
    ' idioma',
    ' por favor',
    ' gracias',
    ' quiero',
    ' necesito',
    ' oferta',
    ' descuento',
    ' tienda',
    ' viernes negro',
  ];
  const score = spanishHints.reduce((acc, s) => (m.includes(s) ? acc + 1 : acc), 0);
  if (hasSpanishChars || score >= 2) return 'es';
  return 'en';
}

function userExplicitlyRequestedDifferentTextLanguage(message: string): boolean {
  const m = (message || '').toLowerCase();
  // Common explicit patterns: “in Spanish”, “en español”, “texto en francés”, “language: es”, etc.
  const explicitLanguagePatterns: RegExp[] = [
    /\b(in|en)\s+(spanish|espanol|español)\b/i,
    /\b(in|en)\s+(french|franc[eé]s)\b/i,
    /\b(in|en)\s+(portuguese|portugu[eê]s)\b/i,
    /\b(in|en)\s+(italian|italiano)\b/i,
    /\b(in|en)\s+(german|deutsch)\b/i,
    /\b(in|en)\s+(english|ingl[eé]s)\b/i,
    /\b(text|texto)\s+(in|en)\s+\w+/i,
    /\b(language|idioma)\s*[:=]\s*[a-z]{2}\b/i,
    /\b(change|switch)\s+(the\s+)?(text\s+)?language\b/i,
    /\b(cambiar|cambia)\s+(el\s+)?idioma\b/i,
  ];
  return explicitLanguagePatterns.some((re) => re.test(m));
}

function looksLikeLanguageConfirmationQuestion(reply: string): boolean {
  const r = (reply || '').toLowerCase();
  return (
    /confirm/.test(r) &&
    /(language|idioma|english|spanish|español|espanol|french|franc[eé]s)/.test(r)
  ) || (
    /(keep|which|what)\s+.*(language|idioma)/.test(r)
  ) || (
    /(english|spanish|español|espanol).*(different\s+language|another\s+language)/.test(r)
  );
}

function buildMissingSlotsReply(params: { language: string; missingStyle: boolean; missingUseCase: boolean }): string {
  const l = (params.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  if (l === 'es') {
    if (params.missingStyle && params.missingUseCase) return '¿Qué estilo de imagen quieres y cuál es el uso/objetivo?';
    if (params.missingStyle) return '¿Qué estilo de imagen quieres?';
    if (params.missingUseCase) return '¿Cuál es el uso/objetivo de la pieza?';
    return 'Perfecto. Estoy generando tu imagen ahora.';
  }
  if (params.missingStyle && params.missingUseCase) return 'What image style would you like, and what is the use case?';
  if (params.missingStyle) return 'What image style would you like?';
  if (params.missingUseCase) return 'What is the use case?';
  return 'Great — generating your image now.';
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function coerceDecision(raw: unknown): ChatDecision {
  if (raw === 'reject' || raw === 'respond' || raw === 'ask_missing' || raw === 'ready') {
    return raw;
  }
  return 'respond';
}

function mergeState(prev: ChatState | undefined, next: ChatState | undefined): ChatState {
  return {
    language: next?.language ?? prev?.language ?? null,
    imageStyle: next?.imageStyle ?? prev?.imageStyle ?? null,
    useCase: next?.useCase ?? prev?.useCase ?? null,
  };
}

type LlmDecision = {
  decision: ChatDecision;
  language?: string | null;
  imageStyle?: string | null;
  useCase?: string | null;
  assistantReply: string;
  shouldGenerate?: boolean;
  endpoint?: 'generate' | 'generate-with-image';
  finalPrompt?: string | null;
  uiIntent?: 'inspiration' | null;
  recommendedPrompt?: string | null;
  inspirationSuggestions?: Array<{ title: string; prompt: string }> | null;
};

async function generateInspirationSuggestions(params: {
  openai: OpenAI;
  model: string;
  languageHint: string | null | undefined;
  userMessage: string;
  assistantReply: string;
}): Promise<{ language?: string | null; inspirationSuggestions?: Array<{ title: string; prompt: string }> | null } | null> {
  const system = [
    'You generate exactly 4 selectable Instagram post suggestions.',
    '- Detect language and output titles/prompts in that language.',
    '- Output ONLY JSON.',
    'Schema: { "language": string, "inspirationSuggestions": [{ "title": string, "prompt": string }] }',
    '- Each prompt must describe a square (1:1) Instagram feed post composition.',
    "- Don't mention pixel dimensions.",
    '- Return exactly 4 suggestions.',
  ].join('\n');

  const user = [
    `LanguageHint: ${params.languageHint ?? 'unknown'}`,
    `UserMessage: ${params.userMessage}`,
    `AssistantIdeas: ${params.assistantReply}`,
    '',
    'Return 4 suggestions. Each suggestion must have a short title and a generation-ready image prompt.',
  ].join('\n');

  try {
    const resp = await params.openai.chat.completions.create({
      model: params.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });
    const raw = resp.choices[0]?.message?.content?.trim() || '';
    const parsed = safeJsonParse<{
      language?: string;
      inspirationSuggestions?: Array<{ title: string; prompt: string }>;
    }>(raw);
    if (!parsed) return null;
    return {
      language: typeof parsed.language === 'string' ? parsed.language : null,
      inspirationSuggestions:
        Array.isArray(parsed.inspirationSuggestions) && parsed.inspirationSuggestions.length > 0
          ? parsed.inspirationSuggestions
              .filter((s) => s && typeof s.title === 'string' && typeof s.prompt === 'string')
              .map((s) => ({ title: s.title.trim(), prompt: s.prompt.trim() }))
          : null,
    };
  } catch {
    return null;
  }
}

function buildSystemPrompt(): string {
  return [
    'You are Postty, an AI assistant that helps users create Instagram post content for businesses and creators.',
    '',
    'Scope + guardrails:',
    '- You may help with: brainstorming IG post ideas, refining image prompts, selecting image style, selecting use case, writing IG captions and hashtags, and revising content for an Instagram post.',
    '- If the user asks for anything unrelated to creating Instagram post content, you MUST politely refuse.',
    '',
    'Conversation behavior:',
    '- Detect the user language and ALWAYS reply in that same language.',
    '- Keep replies concise and conversational.',
    '- IMPORTANT: Do NOT ask the user to confirm the language. Assume the language is the same as the user’s message.',
    '- Only discuss/ask about language if the user explicitly requests that the on-image text be in a different language (e.g. "put the text in Spanish"). If they do, follow that instruction; otherwise keep text in the user’s language.',
    '- If you ask the user to confirm language, your output is INVALID.',
    '',
    'Slot filling (required for generation):',
    '- imageStyle (e.g. cartoon, cinematic, watercolor, minimalist, hyper-realistic)',
    '- useCase (e.g. promotional graphic, product showcase, inspirational post, quote card)',
    '- Only infer a slot if it is clearly and explicitly implied. If uncertain, set it to null and ask a follow-up question only for missing slots.',
    '',
    'Event announcement handling (critical):',
    '- If the user provides concrete event details (event name/title, date/day, time, location), you MUST preserve those exact details in finalPrompt.',
    '- NEVER replace user details with placeholders like "[Event Name]", "EVENT NAME", "[Date]", "[Location]", "CITY, STATE" or similar.',
    '- If the user wants an event announcement but any critical event detail is missing, set decision="ask_missing" and ask only for the missing detail(s).',
    '- When generating an event poster, instruct the image to include legible on-image text: large bold sans-serif, short lines, high contrast, and clear hierarchy.',
    '',
    'Generation readiness:',
    '- If the user is asking to generate an image/post now, ensure both slots are filled. If missing, ask for the missing slot(s).',
    '- If both slots are filled, set decision="ready" and provide finalPrompt to be used for image generation.',
    '- The finalPrompt must describe a square Instagram post composition (1:1). Do not mention pixel dimensions.',
    '- IMPORTANT: When decision="ready" and finalPrompt is present, do NOT ask for confirmation. Assume the user wants to generate now and set shouldGenerate=true.',
    '',
    'Output format:',
    '- Return ONLY valid JSON (no markdown, no extra text).',
    '- Use this JSON schema:',
    '  {',
    '    "decision": "reject" | "respond" | "ask_missing" | "ready",',
    '    "language": string,',
    '    "imageStyle": string|null,',
    '    "useCase": string|null,',
    '    "assistantReply": string,',
    '    "uiIntent": "inspiration"|null,',
    '    "recommendedPrompt": string|null,',
    '    "shouldGenerate": boolean,',
    '    "endpoint": "generate" | "generate-with-image",',
    '    "finalPrompt": string|null',
    '  }',
    '',
    'Language rules:',
    '- Always set "language" to the detected language of the user message (do not leave it null).',
    '- Do NOT ask to confirm language unless the user explicitly requests a different language for the on-image text and it is ambiguous.',
    '',
    'Inspiration UI behavior:',
    '- If the user asks for ideas/inspiration, set uiIntent="inspiration" and include inspirationSuggestions (exactly 4).',
    '- Each inspirationSuggestions item must include {title,prompt}. Prompts must be generation-ready and square (1:1) IG feed composition.',
    '- Do not auto-generate in inspiration mode (shouldGenerate=false) unless the user explicitly asks to generate now.',
  ].join('\n');
}

function buildUserPayload(params: {
  message: string;
  state: ChatState;
  hasReferenceImage: boolean;
  mode: ChatMode;
  basePrompt?: string;
}): string {
  const effectiveLanguage =
    params.state.language && typeof params.state.language === 'string' && params.state.language.trim().length > 0
      ? params.state.language.trim()
      : detectLanguageFromUserMessage(params.message);
  const languageLocked = !userExplicitlyRequestedDifferentTextLanguage(params.message);

  return [
    'Context:',
    `- mode: ${params.mode}`,
    `- hasReferenceImage: ${params.hasReferenceImage ? 'true' : 'false'}`,
    `- state.imageStyle: ${params.state.imageStyle ?? 'null'}`,
    `- state.useCase: ${params.state.useCase ?? 'null'}`,
    `- state.language: ${effectiveLanguage}`,
    `- onImageTextLanguage: ${effectiveLanguage}`,
    `- onImageTextLanguageLocked: ${languageLocked ? 'true' : 'false'}`,
    params.mode === 'regenerate'
      ? `- basePrompt: ${params.basePrompt ?? ''}`
      : '- basePrompt: (none)',
    '',
    `UserMessage: ${params.message}`,
  ].join('\n');
}

/**
 * Registers the /chat route with the Fastify instance.
 * This endpoint orchestrates multi-turn conversation: guardrails, language, and slot-filling for style/use case.
 * When ready, it returns an action telling the client to call the existing generation routes.
 */
export default async function chatRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/chat',
    async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
      try {
        const { message, state, has_reference_image, mode, base_prompt, history } =
          request.body ?? ({} as any);

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "message" field',
          });
        }

        const trimmedMessage = message.trim();
        const mergedIncomingState = mergeState(undefined, state);
        // Deterministically set language from user message if not provided.
        // This prevents the model from asking “which language?” and keeps UX consistent.
        if (!mergedIncomingState.language) {
          mergedIncomingState.language = detectLanguageFromUserMessage(trimmedMessage);
        }
        const hasReferenceImage = !!has_reference_image;
        const effectiveMode: ChatMode = mode === 'regenerate' ? 'regenerate' : 'new';
        const isInspiration = looksLikeInspirationRequest(trimmedMessage);

        const openai = initOpenAIClient();
        const model = (process.env.CHAT_MODEL || 'gpt-4o-mini').trim();

        const systemPrompt = buildSystemPrompt();
        const userPayload = buildUserPayload({
          message: trimmedMessage,
          state: mergedIncomingState,
          hasReferenceImage,
          mode: effectiveMode,
          basePrompt: base_prompt,
        });

        logger.info(`Chat orchestrator request (mode=${effectiveMode}, hasRef=${hasReferenceImage})`);

        const normalizedHistory =
          Array.isArray(history) && history.length > 0
            ? history
                .filter(
                  (m) =>
                    m &&
                    (m.role === 'user' || m.role === 'assistant') &&
                    typeof m.content === 'string' &&
                    m.content.trim().length > 0
                )
                .slice(-16)
            : [];

        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...normalizedHistory.map((m) => ({ role: m.role, content: m.content.trim() as string })),
            { role: 'user', content: userPayload },
          ],
          temperature: 0.4,
          max_tokens: 400,
          response_format: { type: 'json_object' },
        });

        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const parsed = safeJsonParse<LlmDecision>(raw);

        if (!parsed || typeof parsed.assistantReply !== 'string') {
          logger.error('Chat orchestrator returned non-JSON or invalid JSON:', raw);
          return reply.status(200).send({
            status: 'success',
            decision: 'respond',
            reply:
              'Sorry—something went wrong while planning your Instagram post. Please rephrase what you want to create.',
            state: mergedIncomingState,
          });
        }

        const decision = coerceDecision(parsed.decision);
        const nextState = mergeState(mergedIncomingState, {
          language: parsed.language ?? mergedIncomingState.language ?? detectLanguageFromUserMessage(trimmedMessage),
          imageStyle: parsed.imageStyle ?? null,
          useCase: parsed.useCase ?? null,
        });

        const explicitTextLanguageRequested = userExplicitlyRequestedDifferentTextLanguage(trimmedMessage);
        const languageConfirmationLeak =
          !explicitTextLanguageRequested && looksLikeLanguageConfirmationQuestion(parsed.assistantReply);

        // Deterministic guard: never ask language confirmation unless explicitly requested.
        // If the model tries anyway, rewrite its reply and (when possible) proceed to generation.
        if (languageConfirmationLeak) {
          const missingStyle = nextState.imageStyle == null;
          const missingUseCase = nextState.useCase == null;

          logger.warn(
            `Suppressing language-confirmation reply (lang=${nextState.language ?? 'null'}, missingStyle=${missingStyle}, missingUseCase=${missingUseCase}) original="${parsed.assistantReply.slice(0, 140)}..."`
          );

          // If we already have enough info, force generation (avoid extra turn).
          if (!missingStyle && !missingUseCase) {
            // Preserve finalPrompt if the model provided it; otherwise build a conservative prompt.
            const fallbackPrompt =
              typeof parsed.finalPrompt === 'string' && parsed.finalPrompt.trim().length > 0
                ? parsed.finalPrompt.trim()
                : [
                    trimmedMessage,
                    '',
                    'Create a square (1:1) Instagram feed post composition.',
                    'Keep the on-image text language the same as the user message unless explicitly requested otherwise.',
                  ].join('\n');

            (parsed as any).decision = 'ready';
            (parsed as any).finalPrompt = fallbackPrompt;
            (parsed as any).assistantReply = generationStartingReply(nextState.language);
          } else {
            // Otherwise ask only for missing slots (style/use case).
            (parsed as any).assistantReply = buildMissingSlotsReply({
              language: nextState.language ?? 'en',
              missingStyle,
              missingUseCase,
            });
            // Keep decision consistent with slot filling.
            (parsed as any).decision = 'ask_missing';
            (parsed as any).finalPrompt = null;
          }
        }

        // Deterministic behavior: if we have all details (decision=ready + finalPrompt),
        // we should generate immediately. Do not ask the user to confirm.
        // Exception: inspiration mode should never auto-generate.
        const effectiveDecision = coerceDecision((parsed as any).decision);
        const shouldGenerate = effectiveDecision === 'ready' && !isInspiration;
        const endpoint: 'generate' | 'generate-with-image' =
          (parsed.endpoint === 'generate-with-image' || parsed.endpoint === 'generate') ?
            parsed.endpoint :
            (hasReferenceImage ? 'generate-with-image' : 'generate');

        let finalPrompt =
          typeof (parsed as any).finalPrompt === 'string' && (parsed as any).finalPrompt.trim().length > 0
            ? (parsed as any).finalPrompt.trim()
            : null;

        // Deterministic augmentation: if this looks like an event-poster request, append explicit on-image text.
        if (finalPrompt && looksLikeEventPosterRequest(trimmedMessage, nextState.useCase)) {
          const overlay = extractEventOverlay(trimmedMessage, nextState.language);
          const block = buildOnImageTextBlock(overlay, nextState.language);
          if (block) {
            finalPrompt = `${finalPrompt}\n\n${block}`;
          }
        }

        const action: ChatAction =
          shouldGenerate && finalPrompt
            ? { type: 'generate', endpoint, prompt: finalPrompt }
            : undefined;

        // If we're about to generate an image, do not claim we're “showing the final prompt”.
        // The UI immediately generates and displays the image, so keep this message aligned.
        const replyText =
          action && action.type === 'generate'
            ? generationStartingReply(nextState.language)
            : (parsed as any).assistantReply;

        let uiIntent: 'inspiration' | null = parsed.uiIntent ?? null;
        let inspirationSuggestions =
          Array.isArray(parsed.inspirationSuggestions) && parsed.inspirationSuggestions.length > 0
            ? parsed.inspirationSuggestions
                .filter((s) => s && typeof s.title === 'string' && typeof s.prompt === 'string')
                .map((s) => ({ title: s.title.trim(), prompt: s.prompt.trim() }))
            : null;

        // Deterministic fallback: if user asked for inspiration and the model didn't return suggestions,
        // generate them with a small follow-up call so the UI can present a picker.
        if (isInspiration && (!inspirationSuggestions || inspirationSuggestions.length < 4)) {
          uiIntent = 'inspiration';
          const followup = await generateInspirationSuggestions({
            openai,
            model,
            languageHint: nextState.language,
            userMessage: trimmedMessage,
            assistantReply: parsed.assistantReply,
          });
          if (followup?.inspirationSuggestions) inspirationSuggestions = followup.inspirationSuggestions;
          if (followup?.language && !nextState.language) nextState.language = followup.language;
        }

        return reply.status(200).send({
          status: 'success',
          decision: effectiveDecision,
          reply: replyText,
          state: nextState,
          action,
          uiIntent,
          recommendedPrompt: null,
          inspirationSuggestions: inspirationSuggestions ? inspirationSuggestions.slice(0, 4) : null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error in /chat:', errorMessage);
        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}


