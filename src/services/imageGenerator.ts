import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import * as logger from '../utils/logger';
import { generateImagenImage } from './geminiImageGenerator';
import { isOpenAiImageSafetyBlock } from '../utils/promptSafetyRewrite';

type ImageGenerationProvider = 'gemini' | 'openai';

function resolveImageProvider(): ImageGenerationProvider {
  const explicit = (process.env.IMAGE_GENERATION_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'gemini' || explicit === 'openai') return explicit;

  // Default behavior: prefer Gemini/Imagen if GEMINI_API_KEY is present.
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'openai';
}

function initOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

function inferMimeTypeFromPath(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function buildGeneratedImagePath(prompt: string, suffix: string): string {
  const outputDir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const timestamp = Date.now();
  const sanitizedPrompt = prompt
    .substring(0, 50)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  return path.join(outputDir, `${timestamp}_${sanitizedPrompt}${suffix}.png`);
}

/**
 * Generates an image using one or more reference images (true image-conditioned generation)
 * via OpenAI's Images Edits endpoint and gpt-image-1.
 *
 * NOTE: This is the only path in this codebase that actually uses the uploaded image bytes
 * as an input to generation (instead of just using vision analysis text).
 */
export async function generateImageWithReferenceImages(params: {
  prompt: string;
  imagePaths: string[];
  input_fidelity?: 'low' | 'high';
  quality?: 'low' | 'medium' | 'high';
  size?: '1024x1024' | '1024x1536' | '1536x1024';
}): Promise<string> {
  if (!Array.isArray(params.imagePaths) || params.imagePaths.length === 0) {
    throw new Error('generateImageWithReferenceImages requires at least one imagePath');
  }
  for (const p of params.imagePaths) {
    if (!fs.existsSync(p)) throw new Error(`Reference image file not found: ${p}`);
  }

  const openai = initOpenAIClient();
  const prompt = params.prompt;
  const input_fidelity = params.input_fidelity ?? 'high';
  const quality = params.quality ?? 'high';
  const size = params.size ?? '1024x1024';

  try {
    const preferredModel = (process.env.OPENAI_REFERENCE_IMAGE_MODEL || 'gpt-image-1').trim();
    const fallbackModel = 'dall-e-2';
    const modelsToTry = [preferredModel, ...(preferredModel === fallbackModel ? [] : [fallbackModel])];

    // Prepare files for gpt-image-1 (supports jpeg/png/webp).
    const imagesForGpt = await Promise.all(
      params.imagePaths.map(async (filePath) => {
        const mime = inferMimeTypeFromPath(filePath);
        return await toFile(fs.createReadStream(filePath), null, { type: mime });
      })
    );
    // dall-e-2 edits accepts PNG only; we convert the first reference to PNG if needed.
    const firstPath = params.imagePaths[0];
    const d2PngBuf = await sharp(firstPath).png().toBuffer();
    const imageForD2 = await toFile(d2PngBuf, 'reference.png', { type: 'image/png' });

    let lastErr: unknown = null;
    for (const model of modelsToTry) {
      try {
        logger.info(
          `Generating image with OpenAI image edits (model=${model}) using ${params.imagePaths.length} reference image(s) (input_fidelity=${input_fidelity}, quality=${quality}, size=${size})`
        );

        // Model-specific parameter support differs across image models.
        // - gpt-image-1 supports input_fidelity + quality, and returns b64_json by default.
        // - dall-e-2 supports edits but does NOT support input_fidelity/quality.
        // Additionally, dall-e-2 expects a SINGLE image upload (not an array).
        const editParams: any =
          model === 'gpt-image-1'
            ? {
                model,
                image: imagesForGpt,
                prompt,
                input_fidelity,
                quality,
                size,
              }
            : {
                model,
                image: imageForD2,
                prompt,
                size,
                response_format: 'b64_json',
              };

        const rsp = await openai.images.edit(editParams);

        const first = (rsp as any).data?.[0];
        const imageBase64 = first?.b64_json;
        const imageUrl = first?.url;

        const outPath = buildGeneratedImagePath(prompt, '_ref');
        if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
          fs.writeFileSync(outPath, Buffer.from(imageBase64, 'base64'));
          logger.info(`Image generated successfully with OpenAI edits: ${outPath}`);
          return outPath;
        }
        if (typeof imageUrl === 'string' && imageUrl.length > 0) {
          const downloaded = await downloadImage(imageUrl, prompt);
          logger.info(`Image generated successfully with OpenAI edits (url): ${downloaded}`);
          return downloaded;
        }

        throw new Error('No image returned from OpenAI image edit (missing b64_json/url)');
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.warn(`OpenAI image edits failed for model=${model} (${msg})`);
        // If gpt-image-1 is blocked by safety, surface that as the primary error so callers can
        // decide whether to rewrite prompt and retry.
        if (model === 'gpt-image-1' && isOpenAiImageSafetyBlock(e)) {
          throw e;
        }
      }
    }
    throw lastErr ?? new Error('OpenAI image edit failed for all attempted models');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to generate image with OpenAI edits (reference images):', errorMsg);
    throw new Error(`Image generation with reference images failed: ${errorMsg}`);
  }
}

/**
 * Generates an image from a text prompt using OpenAI DALL-E
 * @param prompt - Text description of the image to generate
 * @returns Local file path to the generated image
 */
export async function generateImage(prompt: string): Promise<string> {
  try {
    const provider = resolveImageProvider();
    logger.info(`Image generation provider selected: ${provider}`);

    if (provider === 'gemini') {
      return await generateImagenImage(prompt);
    }

    const openai = initOpenAIClient();
    logger.info(`Generating image with DALL-E: "${prompt}"`);

    // Generate image using DALL-E 3
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'url',
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from OpenAI');
    }

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned from OpenAI');
    }

    logger.info(`Image generated successfully: ${imageUrl}`);

    // Download the generated image
    const localPath = await downloadImage(imageUrl, prompt);
    logger.info(`Image saved locally: ${localPath}`);

    return localPath;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to generate image:', errorMsg);
    throw new Error(`Image generation failed: ${errorMsg}`);
  }
}

/**
 * Generates an image from a text prompt enhanced with visual context from an uploaded image
 * @param userPrompt - User's text description of the desired image
 * @param imageContext - Visual context extracted from uploaded image via GPT-4 Vision
 * @returns Local file path to the generated image
 */
export async function generateImageWithContext(
  userPrompt: string,
  imageContext: string
): Promise<string> {
  try {
    // Combine user prompt with image context to create an enhanced prompt
    const enhancedPrompt = `${userPrompt}\n\nIncorporate these visual elements from the reference image: ${imageContext}`;
    
    const provider = resolveImageProvider();
    logger.info(`Image generation provider selected: ${provider}`);

    if (provider === 'gemini') {
      // Keep the same prompt enhancement logic; pass the enhanced prompt into Imagen.
      return await generateImagenImage(enhancedPrompt);
    }

    const openai = initOpenAIClient();
    logger.info(
      `Generating image with DALL-E using enhanced prompt: "${enhancedPrompt}"`
    );

    // Generate image using DALL-E 3
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: enhancedPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'url',
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from OpenAI');
    }

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned from OpenAI');
    }

    logger.info(`Image generated successfully with context: ${imageUrl}`);

    // Download the generated image
    const localPath = await downloadImage(imageUrl, userPrompt);
    logger.info(`Image saved locally: ${localPath}`);

    return localPath;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to generate image with context:', errorMsg);
    throw new Error(`Image generation with context failed: ${errorMsg}`);
  }
}

/**
 * Downloads an image from a URL and saves it locally
 * @param imageUrl - URL of the image to download
 * @param prompt - Original prompt (used for filename)
 * @returns Local file path to the downloaded image
 */
async function downloadImage(imageUrl: string, prompt: string): Promise<string> {
  // Ensure the generated-images directory exists
  const outputDir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create a safe filename from the prompt
  const timestamp = Date.now();
  const sanitizedPrompt = prompt
    .substring(0, 50) // Limit length
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .toLowerCase();
  const filename = `${timestamp}_${sanitizedPrompt}.png`;
  const filePath = path.join(outputDir, filename);

  try {
    // Download the image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });

    // Save to disk
    fs.writeFileSync(filePath, response.data);

    return filePath;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to download image:', errorMsg);
    throw new Error(`Image download failed: ${errorMsg}`);
  }
}

