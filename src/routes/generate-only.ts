import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import { generateImage } from '../services/imageGenerator';
import { generateCaption } from '../services/captionGenerator';
import { ensureInstagramSquare1080 } from '../services/imageResizer';
import { uploadLocalImage } from '../services/imageUploader';
import { isPixabayEnabled, parseBooleanInput } from '../utils/featureFlags';
import { buildPixabayQuery } from '../services/pixabayQueryBuilder';
import { fetchBestPixabayImage, fetchTopPixabayImages } from '../services/pixabayClient';
import { refinePromptWithGemini } from '../services/geminiPromptRefiner';
import * as logger from '../utils/logger';
import { detectLanguageFromText } from '../utils/language';

interface GenerateOnlyRequestBody {
  prompt: string;
  use_pixabay?: boolean | string | number;
  num_candidates?: number | string;
  preview_only?: boolean | string | number;
}

function clampCandidateCount(n: unknown, fallback: number): number {
  const parsed =
    typeof n === 'number' ? n :
    typeof n === 'string' ? Number(n) :
    NaN;
  const v = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(Math.max(v, 1), 3);
}

function shouldPreviewOnly(v: unknown): boolean {
  // Default to false for backward compatibility unless explicitly enabled.
  if (v == null) return false;
  return parseBooleanInput(v as any);
}

function fileToDataUrl(filePath: string): string {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    'image/png';
  const b64 = Buffer.from(fs.readFileSync(filePath)).toString('base64');
  return `data:${mime};base64,${b64}`;
}

function writeNdjson(res: NodeJS.WritableStream, obj: unknown) {
  res.write(`${JSON.stringify(obj)}\n`);
}

/**
 * Registers the /generate route with the Fastify instance
 * This endpoint generates an image + caption and uploads to S3.
 * It does NOT publish to Instagram (approval flow happens in the frontend).
 */
export default async function generateOnlyRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/generate',
    async (
      request: FastifyRequest<{ Body: GenerateOnlyRequestBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { prompt, use_pixabay, num_candidates, preview_only } = request.body;

        if (!prompt || typeof prompt !== 'string') {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "prompt" field',
          });
        }

        if (prompt.trim().length === 0) {
          return reply.status(400).send({
            status: 'error',
            message: 'Prompt cannot be empty',
          });
        }

        const language = detectLanguageFromText(prompt);

        // Always-on when ENABLE_PIXABAY=true, unless explicitly disabled per-request.
        // - If use_pixabay is omitted, we treat it as enabled.
        // - If use_pixabay is explicitly false, we skip Pixabay.
        const usePixabay =
          isPixabayEnabled() && (use_pixabay == null ? true : parseBooleanInput(use_pixabay));

        logger.info(`Processing AI image generation request (no publish): "${prompt}"`);
        if (usePixabay) logger.info('Pixabay enabled for this request (ENABLE_PIXABAY)');

        const previewOnly = shouldPreviewOnly(preview_only);
        const candidateCount = clampCandidateCount(num_candidates, 3);

        // New UI path: generate N candidates and return preview data URLs (no S3 upload).
        if (previewOnly) {
          reply.raw.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          reply.raw.setHeader('Cache-Control', 'no-cache');
          reply.raw.setHeader('Connection', 'keep-alive');
          reply.hijack();

          writeNdjson(reply.raw, { type: 'start', prompt, total: candidateCount });

          if (usePixabay) {
            try {
              const qb = await buildPixabayQuery({ userPrompt: prompt });
              const selected = await fetchTopPixabayImages(
                {
                  q: qb.query,
                  lang: qb.lang ?? 'en',
                  image_type: 'photo',
                  orientation: qb.orientation ?? 'all',
                  safesearch: true,
                  per_page: 30,
                },
                candidateCount
              );

              for (let i = 0; i < selected.length; i++) {
                const px = selected[i];
                let refinedPrompt: string | null = null;
                let effectivePrompt = prompt;
                try {
                  refinedPrompt = await refinePromptWithGemini({
                    userPrompt: prompt,
                    pixabayImagePath: px.localPath,
                  });
                  effectivePrompt = refinedPrompt;
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Unknown error';
                  logger.warn(`Gemini refine failed for candidate ${i + 1} (${msg}); using original prompt.`);
                }

                logger.info(`Generating candidate ${i + 1}/${selected.length}...`);
                const generatedImagePath = await generateImage(effectivePrompt);
                const resizedImagePath = await ensureInstagramSquare1080(generatedImagePath);
                const previewDataUrl = fileToDataUrl(resizedImagePath);

                const captionPrompt =
                  language === 'es'
                    ? `${prompt}\n\nEscribe un caption corto para Instagram con hashtags. ` +
                      `Haz que esta variación #${i + 1} sea distinta de las otras.`
                    : `${prompt}\n\nWrite a short Instagram caption with hashtags. ` +
                      `Make this caption variation #${i + 1} different from the others.`;
                const caption = await generateCaption(captionPrompt, { forcedLanguage: language });

                writeNdjson(reply.raw, {
                  type: 'candidate',
                  index: i + 1,
                  total: selected.length,
                  candidate: {
                    candidate_id: `px-${px.id}-${i + 1}`,
                    image: {
                      preview_data_url: previewDataUrl,
                      generated_image_path: resizedImagePath,
                    },
                    caption: {
                      text: caption,
                      language,
                      prompt_used: captionPrompt,
                    },
                    caption_text: caption,
                    // Legacy/compat fields (for older UI paths):
                    preview_data_url: previewDataUrl,
                    generated_image_path: resizedImagePath,
                    refined_prompt: refinedPrompt,
                    pixabay: { id: px.id, pageURL: px.pageURL, tags: px.tags, query: qb.query },
                  },
                });
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              logger.warn(`Pixabay candidate flow failed (${msg}); generating without pixabay.`);
            }
          } else {
            for (let i = 0; i < candidateCount; i++) {
              logger.info(`Generating candidate ${i + 1}/${candidateCount} (no pixabay)...`);
              const generatedImagePath = await generateImage(prompt);
              const resizedImagePath = await ensureInstagramSquare1080(generatedImagePath);
              const previewDataUrl = fileToDataUrl(resizedImagePath);
              const captionPrompt =
                language === 'es'
                  ? `${prompt}\n\nEscribe un caption corto para Instagram con hashtags. ` +
                    `Haz que esta variación #${i + 1} sea distinta de las otras.`
                  : `${prompt}\n\nWrite a short Instagram caption with hashtags. ` +
                    `Make this caption variation #${i + 1} different from the others.`;
              const caption = await generateCaption(captionPrompt, { forcedLanguage: language });
              writeNdjson(reply.raw, {
                type: 'candidate',
                index: i + 1,
                total: candidateCount,
                candidate: {
                  candidate_id: `gen-${i + 1}`,
                  image: {
                    preview_data_url: previewDataUrl,
                    generated_image_path: resizedImagePath,
                  },
                  caption: {
                    text: caption,
                    language,
                    prompt_used: captionPrompt,
                  },
                  caption_text: caption,
                  // Legacy/compat fields:
                  preview_data_url: previewDataUrl,
                  generated_image_path: resizedImagePath,
                },
              });
            }
          }

          writeNdjson(reply.raw, { type: 'done' });
          reply.raw.end();
          return;
        }

        let effectivePrompt = prompt;
        let refinedPrompt: string | null = null;
        let pixabay: { id: number; pageURL: string; tags: string; query: string } | null = null;

        if (usePixabay) {
          try {
            const qb = await buildPixabayQuery({ userPrompt: prompt });
            const selected = await fetchBestPixabayImage({
              q: qb.query,
              lang: qb.lang ?? 'en',
              image_type: 'photo',
              orientation: qb.orientation ?? 'all',
              safesearch: true,
              per_page: 30,
            });

            logger.info(`Pixabay selected for refinement: pageURL=${selected.pageURL} localPath=${selected.localPath}`);

            refinedPrompt = await refinePromptWithGemini({
              userPrompt: prompt,
              pixabayImagePath: selected.localPath,
            });

            effectivePrompt = refinedPrompt;
            pixabay = { id: selected.id, pageURL: selected.pageURL, tags: selected.tags, query: qb.query };
            logger.info(`✓ Pixabay selected: id=${selected.id} tags="${selected.tags}"`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`Pixabay/Gemini opt-in failed (${msg}); falling back to original prompt.`);
            refinedPrompt = null;
            pixabay = null;
            effectivePrompt = prompt;
          }
        }

        // Step 1/3: Generate image from prompt
        logger.info('Step 1/3: Generating image with AI...');
        const generatedImagePath = await generateImage(effectivePrompt);
        logger.info(`✓ Image generated: ${generatedImagePath}`);

        // Step 2/4: Enforce Instagram 1080x1080 output
        logger.info('Step 2/4: Resizing image to Instagram 1080x1080...');
        const resizedImagePath = await ensureInstagramSquare1080(generatedImagePath);
        logger.info(`✓ Image resized: ${resizedImagePath}`);

        // Step 3/4: Generate Instagram caption
        logger.info('Step 3/4: Generating Instagram caption...');
        // Preserve existing behavior: caption is based on the original prompt (even if opt-in changes the image prompt).
        const caption = await generateCaption(prompt, { forcedLanguage: language });
        logger.info(`✓ Caption generated: "${caption}"`);

        // Step 4/4: Upload image to S3
        logger.info('Step 4/4: Uploading image to S3...');
        const uploadedImageUrl = await uploadLocalImage(resizedImagePath);
        logger.info(`✓ Image uploaded: ${uploadedImageUrl}`);

        const responseBody: any = {
          status: 'success',
          prompt: prompt,
          generated_image_path: resizedImagePath,
          caption: caption,
          uploaded_image_url: uploadedImageUrl,
        };

        // Preserve default response shape unless the feature is explicitly opted-in.
        if (usePixabay) {
          responseBody.refined_prompt = refinedPrompt;
          responseBody.pixabay = pixabay;
        }

        return reply.status(200).send(responseBody);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error processing AI image generation (no publish):', errorMessage);

        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}


