import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { generateCaption } from '../services/captionGenerator';
import { SupportedLanguage, detectLanguageFromText } from '../utils/language';

type CaptionRequestBody = {
  base_prompt: string;
  instruction?: string | null;
  language?: SupportedLanguage;
};

export default async function captionRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/caption',
    async (request: FastifyRequest<{ Body: CaptionRequestBody }>, reply: FastifyReply) => {
      try {
        const body = request.body ?? ({} as any);
        const basePrompt = typeof body.base_prompt === 'string' ? body.base_prompt.trim() : '';
        const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';

        if (!basePrompt) {
          return reply.status(400).send({ status: 'error', message: 'Missing or invalid "base_prompt" field' });
        }

        const forcedLanguage: SupportedLanguage =
          body.language === 'es' || body.language === 'en'
            ? body.language
            : detectLanguageFromText(basePrompt);

        // Build a caption prompt that keeps the image intent but obeys the user’s caption instruction.
        const captionPrompt =
          instruction.length > 0
            ? forcedLanguage === 'es'
              ? `${basePrompt}\n\nInstrucción de caption: ${instruction}\n\nEscribe SOLO el caption final (1-2 frases) y 3-5 hashtags al final.`
              : `${basePrompt}\n\nCaption instruction: ${instruction}\n\nWrite ONLY the final caption (1-2 sentences) and 3-5 hashtags at the end.`
            : basePrompt;

        logger.info(`Generating caption-only (lang=${forcedLanguage})`);
        const text = await generateCaption(captionPrompt, { forcedLanguage, temperature: 0.5 });

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


