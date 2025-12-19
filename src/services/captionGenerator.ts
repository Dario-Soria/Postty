import OpenAI from 'openai';
import * as logger from '../utils/logger';
import { detectLanguageFromText, SupportedLanguage } from '../utils/language';

/**
 * Generates an Instagram caption from an image prompt using OpenAI GPT
 * @param imagePrompt - The prompt that was used to generate the image
 * @returns Instagram-ready caption with hashtags
 */
export async function generateCaption(
  imagePrompt: string,
  opts?: { forcedLanguage?: SupportedLanguage; temperature?: number }
): Promise<string> {
  // Validate OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  try {
    logger.info(`Generating Instagram caption for prompt: "${imagePrompt}"`);

    const forced = opts?.forcedLanguage ?? detectLanguageFromText(imagePrompt);
    const languageLine =
      forced === 'es'
        ? 'IMPORTANT: Write the caption and hashtags ONLY in Spanish.'
        : 'IMPORTANT: Write the caption and hashtags ONLY in English.';

    const systemPrompt = [
      'You are an expert Instagram content creator.',
      'Create engaging, concise captions for Instagram posts based on image descriptions.',
      'Rules:',
      '- 1-2 sentences maximum.',
      '- Include 3-5 relevant hashtags at the end.',
      '- Match the tone and style of the image description.',
      '- Be authentic and relatable.',
      languageLine,
      '- Do NOT wrap the caption in quotes.',
    ].join('\n');

    const userPrompt = [
      'Create an Instagram caption for an image that shows:',
      imagePrompt,
    ].join('\n');

    const model = (process.env.CAPTION_MODEL || 'gpt-4o-mini').trim();
    const temperature = typeof opts?.temperature === 'number' ? opts.temperature : 0.7;

    async function attempt(temp: number): Promise<string | null> {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 160,
        temperature: temp,
      });
      const caption = response.choices[0]?.message?.content?.trim() || '';
      return caption.length > 0 ? caption : null;
    }

    let caption = await attempt(temperature);
    if (!caption) {
      logger.warn('No caption generated, using fallback');
      return `${imagePrompt} ✨`;
    }

    // Validate language deterministically; if mismatch, retry once with stricter settings.
    const detected = detectLanguageFromText(caption);
    if (detected !== forced) {
      logger.warn(`Caption language mismatch (forced=${forced}, detected=${detected}); retrying once.`);
      const retry = await attempt(0.2);
      if (retry) caption = retry;
    }

    logger.info(`Caption generated successfully: "${caption}"`);
    return caption;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to generate caption:', errorMsg);

    // Fallback: return a simple caption based on the prompt
    logger.info('Using fallback caption');
    return `${imagePrompt} ✨`;
  }
}

