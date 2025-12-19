import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeImageWithVision } from '../services/imageAnalyzer';
import { generateImage, generateImageWithContext, generateImageWithReferenceImages } from '../services/imageGenerator';
import { generateCaption } from '../services/captionGenerator';
import { ensureInstagramSquare1080 } from '../services/imageResizer';
import { uploadLocalImage } from '../services/imageUploader';
import { isPixabayEnabled, parseBooleanInput } from '../utils/featureFlags';
import { buildPixabayQuery } from '../services/pixabayQueryBuilder';
import { fetchBestPixabayImage, fetchTopPixabayImages } from '../services/pixabayClient';
import { refinePromptWithGemini } from '../services/geminiPromptRefiner';
import { wantsUnalteredUploadedImage } from '../utils/promptHeuristics';
import * as logger from '../utils/logger';
import { detectLanguageFromText } from '../utils/language';
import { isOpenAiImageSafetyBlock, rewritePromptForSafeMerge } from '../utils/promptSafetyRewrite';

function clampCandidateCount(n: unknown, fallback: number): number {
  const parsed =
    typeof n === 'number' ? n :
    typeof n === 'string' ? Number(n) :
    NaN;
  const v = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(Math.max(v, 1), 3);
}

function shouldPreviewOnly(v: unknown): boolean {
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
 * Registers the /generate-with-image route with the Fastify instance
 * This endpoint accepts an uploaded image and text prompt, analyzes the image with GPT-4 Vision,
 * generates a new AI image incorporating visual context, uploads it to S3, and returns the result.
 * It does NOT publish to Instagram (approval flow happens in the frontend).
 */
export default async function generateWithImageOnlyRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/generate-with-image',
    async (request: FastifyRequest, reply: FastifyReply) => {
      let tempImagePath: string | null = null;

      try {
        const parts = request.parts();
        let imageBuffer: Buffer | null = null;
        let imageFilename: string | null = null;
        let imageMimetype: string | null = null;
        let prompt: string | null = null;
        let use_pixabay: boolean | string | number | null = null;
        let num_candidates: string | number | null = null;
        let preview_only: string | number | boolean | null = null;
        let base_image_path: string | null = null;

        for await (const part of parts) {
          if (part.type === 'file') {
            imageBuffer = await part.toBuffer();
            imageFilename = part.filename;
            imageMimetype = part.mimetype;
          } else {
            if (part.fieldname === 'prompt') {
              prompt = part.value as string;
            } else if (part.fieldname === 'use_pixabay') {
              use_pixabay = part.value as string;
            } else if (part.fieldname === 'num_candidates') {
              num_candidates = part.value as any;
            } else if (part.fieldname === 'preview_only') {
              preview_only = part.value as any;
            } else if (part.fieldname === 'base_image_path') {
              base_image_path = (part.value as string) || null;
            }
          }
        }

        if (!imageBuffer || !imageFilename || !imageMimetype) {
          return reply.status(400).send({
            status: 'error',
            message: 'No file uploaded. Please provide an image file in the "image" field.',
          });
        }

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "prompt" field. Please provide a text prompt.',
          });
        }

        if (!imageMimetype.startsWith('image/')) {
          return reply.status(400).send({
            status: 'error',
            message: `Invalid file type: ${imageMimetype}. Please upload an image file (JPEG, PNG, etc.).`,
          });
        }

        logger.info(`Processing image + prompt request (no publish): "${prompt}"`);
        logger.info(`Uploaded file: ${imageFilename}, type: ${imageMimetype}`);
        const language = detectLanguageFromText(prompt);

        // Always-on when ENABLE_PIXABAY=true, unless:
        // - the user explicitly requests to keep the uploaded image unaltered, or
        // - use_pixabay is explicitly false.
        const wantsUnaltered = wantsUnalteredUploadedImage(prompt);
        const requestAllowsPixabay = use_pixabay == null ? true : parseBooleanInput(use_pixabay);
        const usePixabay = isPixabayEnabled() && requestAllowsPixabay && !wantsUnaltered;
        if (wantsUnaltered) {
          logger.info('Detected unaltered-upload intent; skipping Pixabay and skipping AI re-render.');
        } else if (usePixabay) {
          logger.info('Pixabay enabled for this request (ENABLE_PIXABAY)');
        }

        const previewOnly = shouldPreviewOnly(preview_only);
        const candidateCount = clampCandidateCount(num_candidates, 3);

        // Ensure temp-uploads directory exists
        const tempDir = path.join(process.cwd(), 'temp-uploads');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Save uploaded file to temporary location
        const timestamp = Date.now();
        const extension = imageFilename.split('.').pop() || 'jpg';
        const tempFilename = `${timestamp}_upload.${extension}`;
        tempImagePath = path.join(tempDir, tempFilename);

        fs.writeFileSync(tempImagePath, imageBuffer);
        logger.info(`✓ Uploaded image saved temporarily: ${tempImagePath}`);

        const baseImagePath =
          base_image_path && typeof base_image_path === 'string' && base_image_path.trim().length > 0
            ? base_image_path.trim()
            : null;
        if (baseImagePath) {
          if (!fs.existsSync(baseImagePath)) {
            return reply.status(400).send({
              status: 'error',
              message: `base_image_path not found on server: ${baseImagePath}`,
            });
          }
          logger.info(`Using base_image_path for strict regen: ${baseImagePath}`);
        }

        async function generateMergedImageStrict(params: { prompt: string; extraRefImagePath?: string | null }) {
          // Always attempt true merge first.
          const refImages = [
            ...(baseImagePath ? [baseImagePath] : []),
            tempImagePath as string,
            ...(params.extraRefImagePath ? [params.extraRefImagePath] : []),
          ];
          try {
            const img = await generateImageWithReferenceImages({
              prompt: params.prompt,
              imagePaths: refImages,
              input_fidelity: 'high',
              quality: 'high',
              size: '1024x1024',
            });
            return { imagePath: img, promptUsed: params.prompt, promptAdjusted: false, note: null as string | null };
          } catch (e) {
            // Only rewrite if the merge was blocked by safety.
            if (!isOpenAiImageSafetyBlock(e)) throw e;
            const rewritten = rewritePromptForSafeMerge(params.prompt);
            if (!rewritten.changed) throw e;
            logger.warn(`Safety blocked merge. Retrying with safe rewrite.`);
            const img2 = await generateImageWithReferenceImages({
              prompt: rewritten.rewritten,
              imagePaths: refImages,
              input_fidelity: 'high',
              quality: 'high',
              size: '1024x1024',
            });
            return { imagePath: img2, promptUsed: rewritten.rewritten, promptAdjusted: true, note: rewritten.note };
          }
        }

        // If the user wants the uploaded image unaltered, skip any AI re-rendering.
        // We still produce the same kind of output the frontend expects: an uploaded_image_url and a caption.
        if (wantsUnaltered) {
          logger.info('Unaltered flow: resizing uploaded image to Instagram 1080x1080...');
          const resizedImagePath = await ensureInstagramSquare1080(tempImagePath);
          logger.info(`✓ Image resized: ${resizedImagePath}`);

          logger.info('Unaltered flow: generating caption...');
          const caption = await generateCaption(prompt, { forcedLanguage: language });
          logger.info(`✓ Caption generated: "${caption}"`);

          if (previewOnly) {
            reply.raw.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            reply.raw.setHeader('Cache-Control', 'no-cache');
            reply.raw.setHeader('Connection', 'keep-alive');
            reply.hijack();

            const previewDataUrl = fileToDataUrl(resizedImagePath);
            if (tempImagePath && fs.existsSync(tempImagePath)) {
              fs.unlinkSync(tempImagePath);
              logger.info('✓ Temporary file cleaned up');
            }
            writeNdjson(reply.raw, { type: 'start', prompt, total: 1 });
            writeNdjson(reply.raw, {
              type: 'candidate',
              index: 1,
              total: 1,
              candidate: {
                candidate_id: 'unaltered-1',
                preview_data_url: previewDataUrl,
                generated_image_path: resizedImagePath,
                used_reference_image_edit: false,
                caption,
              },
            });
            writeNdjson(reply.raw, { type: 'done' });
            reply.raw.end();
            return;
          }

          logger.info('Unaltered flow: uploading image to S3...');
          const uploadedImageUrl = await uploadLocalImage(resizedImagePath);
          logger.info(`✓ Image uploaded: ${uploadedImageUrl}`);

          if (tempImagePath && fs.existsSync(tempImagePath)) {
            fs.unlinkSync(tempImagePath);
            logger.info('✓ Temporary file cleaned up');
          }

          return reply.status(200).send({
            status: 'success',
            prompt: prompt,
            generated_image_path: resizedImagePath,
            caption,
            uploaded_image_url: uploadedImageUrl,
          });
        }

        // Step 1/4: Analyze the uploaded image with GPT-4 Vision
        logger.info('Step 1/4: Analyzing uploaded image with GPT-4 Vision...');
        const imageAnalysis = await analyzeImageWithVision(tempImagePath);
        logger.info(`✓ Image analysis: "${imageAnalysis.substring(0, 100)}..."`);

        // New UI path: return N preview candidates without uploading.
        if (previewOnly) {
          reply.raw.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          reply.raw.setHeader('Cache-Control', 'no-cache');
          reply.raw.setHeader('Connection', 'keep-alive');
          reply.hijack();

          writeNdjson(reply.raw, { type: 'start', prompt, total: candidateCount });

          if (usePixabay) {
            try {
              const qb = await buildPixabayQuery({ userPrompt: prompt, extraContext: imageAnalysis });
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
                let usedReferenceEdit = false;
                let generatedImagePath: string;
                let promptUsedForImage: string = '';
                let promptAdjustedNote: string | null = null;
                try {
                  refinedPrompt = await refinePromptWithGemini({
                    userPrompt: prompt,
                    pixabayImagePath: px.localPath,
                    userImagePath: tempImagePath,
                    visionAnalysis: imageAnalysis,
                  });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Unknown error';
                  logger.warn(`Gemini refine failed for candidate ${i + 1} (${msg}); using enhanced prompt.`);
                }

                const effectivePrompt =
                  refinedPrompt ??
                  `${prompt}\n\nIncorporate these visual elements from the reference image: ${imageAnalysis}`;

                // Prefer reference-image generation with both user image + pixabay image.
                try {
                  const merged = await generateMergedImageStrict({ prompt: effectivePrompt, extraRefImagePath: px.localPath });
                  generatedImagePath = merged.imagePath;
                  promptUsedForImage = merged.promptUsed;
                  promptAdjustedNote = merged.note;
                  usedReferenceEdit = true;
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Unknown error';
                  // Strict requirement: do not composite. Ask user to adjust the prompt.
                  logger.warn(`OpenAI merge failed (${msg}); stopping (strict merge required).`);
                  writeNdjson(reply.raw, {
                    type: 'error',
                    message:
                      language === 'es'
                        ? 'Tu solicitud fue bloqueada al intentar integrar la foto. Prueba reformular (ej: “con camiseta sin mangas” en vez de “sin remera”) y vuelve a intentar.'
                        : 'Your request was blocked while trying to merge the uploaded image. Please rephrase and try again.',
                  });
                  writeNdjson(reply.raw, { type: 'done' });
                  reply.raw.end();
                  return;
                }

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
                      used_reference_image_edit: usedReferenceEdit,
                      prompt_used: promptUsedForImage || effectivePrompt,
                      prompt_adjustment_note: promptAdjustedNote,
                    },
                    caption: {
                      text: caption,
                      language,
                      prompt_used: captionPrompt,
                    },
                    pixabay: { id: px.id, pageURL: px.pageURL, tags: px.tags, query: qb.query },
                    used_reference_image_edit: usedReferenceEdit,
                    caption_text: caption,
                    // Legacy/compat fields:
                    preview_data_url: previewDataUrl,
                    generated_image_path: resizedImagePath,
                    refined_prompt: refinedPrompt,
                    recipe: {
                      strategy: 'reference_edit',
                      base_image_path: baseImagePath,
                      prompt_original: effectivePrompt,
                      prompt_used: promptUsedForImage || effectivePrompt,
                      prompt_adjusted: !!promptAdjustedNote,
                      prompt_adjustment_note: promptAdjustedNote,
                      pixabay: { id: px.id, local_path: px.localPath, query: qb.query },
                    },
                  },
                });
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              logger.warn(`Pixabay candidate flow failed (${msg}); generating without pixabay.`);
            }
          } else {
            for (let i = 0; i < candidateCount; i++) {
              let usedReferenceEdit = false;
              let generatedImagePath: string;
              const enhancedPrompt = `${prompt}\n\nIncorporate these visual elements from the reference image: ${imageAnalysis}`;
              let promptUsedForImage: string = enhancedPrompt;
              let promptAdjustedNote: string | null = null;
              try {
                const merged = await generateMergedImageStrict({ prompt: enhancedPrompt });
                generatedImagePath = merged.imagePath;
                promptUsedForImage = merged.promptUsed;
                promptAdjustedNote = merged.note;
                usedReferenceEdit = true;
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                logger.warn(`OpenAI merge failed (${msg}); stopping (strict merge required).`);
                writeNdjson(reply.raw, {
                  type: 'error',
                  message:
                    language === 'es'
                      ? 'Tu solicitud fue bloqueada al intentar integrar la foto. Prueba reformular (ej: “con camiseta sin mangas” en vez de “sin remera”) y vuelve a intentar.'
                      : 'Your request was blocked while trying to merge the uploaded image. Please rephrase and try again.',
                });
                writeNdjson(reply.raw, { type: 'done' });
                reply.raw.end();
                return;
              }

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
                    used_reference_image_edit: usedReferenceEdit,
                    prompt_used: promptUsedForImage,
                    prompt_adjustment_note: promptAdjustedNote,
                  },
                  caption: {
                    text: caption,
                    language,
                    prompt_used: captionPrompt,
                  },
                  used_reference_image_edit: usedReferenceEdit,
                  caption_text: caption,
                  // Legacy/compat fields:
                  preview_data_url: previewDataUrl,
                  generated_image_path: resizedImagePath,
                  recipe: {
                    strategy: 'reference_edit',
                    base_image_path: baseImagePath,
                    prompt_original: enhancedPrompt,
                    prompt_used: promptUsedForImage,
                    prompt_adjusted: !!promptAdjustedNote,
                    prompt_adjustment_note: promptAdjustedNote,
                    pixabay: null,
                  },
                },
              });
            }
          }

          if (tempImagePath && fs.existsSync(tempImagePath)) {
            fs.unlinkSync(tempImagePath);
            logger.info('✓ Temporary file cleaned up');
          }

          writeNdjson(reply.raw, { type: 'done' });
          reply.raw.end();
          return;
        }

        // Step 2/5: Generate new image with context
        logger.info('Step 2/5: Generating AI image with visual context...');
        let generatedImagePath: string;
        let refinedPrompt: string | null = null;
        let pixabay: { id: number; pageURL: string; tags: string; query: string } | null = null;
        let usedReferenceEdit = false;

        if (usePixabay) {
          try {
            const qb = await buildPixabayQuery({ userPrompt: prompt, extraContext: imageAnalysis });
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
              userImagePath: tempImagePath,
              visionAnalysis: imageAnalysis,
            });

            pixabay = { id: selected.id, pageURL: selected.pageURL, tags: selected.tags, query: qb.query };
            logger.info(`✓ Pixabay selected: id=${selected.id} tags="${selected.tags}"`);

            // Prefer true reference-image generation when a user uploads an image.
            // If gpt-image-1 edits is not available (org not verified, etc.), fall back to the existing text-only path.
            try {
              generatedImagePath = await generateImageWithReferenceImages({
                prompt: refinedPrompt,
                imagePaths: [tempImagePath, selected.localPath],
                input_fidelity: 'high',
                quality: 'high',
                size: '1024x1024',
              });
              usedReferenceEdit = true;
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              logger.warn(`OpenAI reference-image edit failed (${msg}); falling back to text-only generation.`);
              generatedImagePath = await generateImage(refinedPrompt);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`Pixabay/Gemini opt-in failed (${msg}); falling back to existing generateImageWithContext path.`);
            refinedPrompt = null;
            pixabay = null;
            // Try reference-image edit even in fallback mode; if unavailable, keep existing behavior.
            try {
              const enhancedPrompt = `${prompt}\n\nIncorporate these visual elements from the reference image: ${imageAnalysis}`;
              generatedImagePath = await generateImageWithReferenceImages({
                prompt: enhancedPrompt,
                imagePaths: [tempImagePath],
                input_fidelity: 'high',
                quality: 'high',
                size: '1024x1024',
              });
              usedReferenceEdit = true;
            } catch (ee) {
              const msg2 = ee instanceof Error ? ee.message : 'Unknown error';
              logger.warn(`OpenAI reference-image edit failed (${msg2}); falling back to generateImageWithContext.`);
              generatedImagePath = await generateImageWithContext(prompt, imageAnalysis);
            }
          }
        } else {
          // Prefer true reference-image generation when a user uploads an image.
          // If edits is not available, fall back to the existing text-only path.
          try {
            const enhancedPrompt = `${prompt}\n\nIncorporate these visual elements from the reference image: ${imageAnalysis}`;
            generatedImagePath = await generateImageWithReferenceImages({
              prompt: enhancedPrompt,
              imagePaths: [tempImagePath],
              input_fidelity: 'high',
              quality: 'high',
              size: '1024x1024',
            });
            usedReferenceEdit = true;
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`OpenAI reference-image edit failed (${msg}); falling back to generateImageWithContext.`);
            generatedImagePath = await generateImageWithContext(prompt, imageAnalysis);
          }
        }
        logger.info(`✓ Image generated: ${generatedImagePath}`);

        // Step 3/5: Enforce Instagram 1080x1080 output
        logger.info('Step 3/5: Resizing image to Instagram 1080x1080...');
        const resizedImagePath = await ensureInstagramSquare1080(generatedImagePath);
        logger.info(`✓ Image resized: ${resizedImagePath}`);

        // Step 4/5: Generate Instagram caption
        logger.info('Step 4/5: Generating Instagram caption...');
        const caption = await generateCaption(prompt, { forcedLanguage: language });
        logger.info(`✓ Caption generated: "${caption}"`);

        // Step 5/5: Upload generated image to S3
        logger.info('Step 5/5: Uploading image to S3...');
        const uploadedImageUrl = await uploadLocalImage(resizedImagePath);
        logger.info(`✓ Image uploaded: ${uploadedImageUrl}`);

        // Clean up: delete temporary uploaded file
        if (tempImagePath && fs.existsSync(tempImagePath)) {
          fs.unlinkSync(tempImagePath);
          logger.info('✓ Temporary file cleaned up');
        }

        const enhancedPrompt = `${prompt}\n\nIncorporate these visual elements from the reference image: ${imageAnalysis}`;

        const responseBody: any = {
          status: 'success',
          prompt: prompt,
          uploaded_image_analysis: imageAnalysis,
          enhanced_prompt: enhancedPrompt,
          generated_image_path: resizedImagePath,
          caption: caption,
          uploaded_image_url: uploadedImageUrl,
          used_reference_image_edit: usedReferenceEdit,
        };

        // Preserve default response shape unless the feature is explicitly opted-in.
        if (usePixabay) {
          responseBody.refined_prompt = refinedPrompt;
          responseBody.pixabay = pixabay;
        }

        return reply.status(200).send(responseBody);
      } catch (error) {
        if (tempImagePath && fs.existsSync(tempImagePath)) {
          try {
            fs.unlinkSync(tempImagePath);
            logger.info('Temporary file cleaned up after error');
          } catch (cleanupError) {
            logger.error('Failed to clean up temporary file:', cleanupError);
          }
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error processing image + prompt generation (no publish):', errorMessage);

        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}


