import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { generateCaption } from '../services/captionGenerator';
import { SupportedLanguage, detectLanguageFromText } from '../utils/language';

type CaptionRequestBody = {
  base_prompt: string;
  instruction?: string | null;
  language?: SupportedLanguage;
  product_image_url?: string | null;
  product_image_base64?: string | null;
};

export default async function captionRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/caption',
    async (request: FastifyRequest<{ Body: CaptionRequestBody }>, reply: FastifyReply) => {
      try {
        const body = request.body ?? ({} as any);
        const basePrompt = typeof body.base_prompt === 'string' ? body.base_prompt.trim() : '';
        const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
        const productImageUrl =
          typeof (body as any).product_image_url === 'string' ? String((body as any).product_image_url).trim() : '';
        const productImageBase64 =
          typeof (body as any).product_image_base64 === 'string'
            ? String((body as any).product_image_base64).trim()
            : '';

        if (!basePrompt) {
          return reply.status(400).send({ status: 'error', message: 'Missing or invalid "base_prompt" field' });
        }

        const forcedLanguage: SupportedLanguage =
          body.language === 'es' || body.language === 'en'
            ? body.language
            : detectLanguageFromText(basePrompt);

        // Build a caption prompt that keeps the image intent but obeys the user’s caption instruction,
        // with strict engagement + relevance constraints.
        const captionPrompt =
          forcedLanguage === 'es'
            ? [
                basePrompt,
                instruction.length > 0 ? `\nInstrucción adicional: ${instruction}\n` : '',
                'Escribe SOLO el caption final para Instagram.',
                'Reglas (estrictas):',
                '- 1–2 frases.',
                '- Incluye 1 pregunta si encaja naturalmente (no la fuerces).',
                '- Incluye 1 CTA claro (por ejemplo: comentar, guardar, DM, elegir).',
                '- Incluye términos relevantes del producto/objetivo de forma natural (optimización de términos sin spam).',
                '- Termina con 3–5 hashtags altamente relevantes.',
                '- Hashtags: mezcla nicho + comunidad/industria; solo incluye branded/campaign si el nombre aparece explícitamente; no inventes marcas.',
                '- No uses comillas.',
              ]
                .filter(Boolean)
                .join('\n')
            : [
                basePrompt,
                instruction.length > 0 ? `\nAdditional instruction: ${instruction}\n` : '',
                'Write ONLY the final Instagram caption.',
                'Rules (strict):',
                '- 1–2 sentences.',
                '- Include ONE question if it fits naturally (do not force it).',
                '- Include ONE clear CTA (e.g., comment, save, DM, choose).',
                '- Naturally include relevant product/goal terms (SEO-friendly without spam).',
                '- End with 3–5 highly relevant hashtags.',
                '- Hashtags: mix niche + community/industry; only include branded/campaign if the name is explicitly present; do not invent brand names.',
                '- Do not wrap the caption in quotes.',
              ]
                .filter(Boolean)
                .join('\n');

        logger.info(`Generating caption-only (lang=${forcedLanguage})`);
        const text = await generateCaption(captionPrompt, {
          forcedLanguage,
          temperature: 0.5,
          mode: 'interactive',
          productImageUrl: productImageUrl || null,
          productImageBase64: productImageBase64 || null,
        });

        return reply.status(200).send({
          status: 'success',
          caption: {
            text,
            language: forcedLanguage,
            prompt_used: captionPrompt,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error occurred';
        logger.error('Error in /caption:', msg);
        return reply.status(500).send({ status: 'error', message: msg });
      }
    }
  );
}


