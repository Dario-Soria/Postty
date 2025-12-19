import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as logger from '../utils/logger';

type GeminiImageSize = '1K' | '2K';
type GeminiAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

function getOutputDir(): string {
  const outputDir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

function sanitizePromptForFilename(prompt: string): string {
  return prompt
    .substring(0, 50)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function resolveImagenModel(): string {
  // Default to the current "latest" Imagen generation model for the Gemini API.
  // (Can be overridden via GEMINI_IMAGE_MODEL.)
  return process.env.GEMINI_IMAGE_MODEL || 'imagen-4.0-generate-001';
}

function resolveImagenImageSize(): GeminiImageSize {
  const raw = (process.env.GEMINI_IMAGE_SIZE || '1K').toUpperCase();
  if (raw === '2K') return '2K';
  return '1K';
}

function resolveImagenAspectRatio(): GeminiAspectRatio {
  const raw = process.env.GEMINI_ASPECT_RATIO || '1:1';
  const allowed: GeminiAspectRatio[] = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  if (allowed.includes(raw as GeminiAspectRatio)) return raw as GeminiAspectRatio;
  return '1:1';
}

function resolveNumberOfImages(): number {
  const n = parsePositiveInt(process.env.GEMINI_NUMBER_OF_IMAGES);
  // Keep parity with existing behavior (always 1 image).
  return n && n >= 1 && n <= 4 ? n : 1;
}

/**
 * Generates an image from a text prompt using Gemini Imagen via Google AI Studio.
 * Returns a local file path to the generated image saved under generated-images/.
 */
export async function generateImagenImage(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const model = resolveImagenModel();
  const numberOfImages = resolveNumberOfImages();
  const imageSize = resolveImagenImageSize();
  const aspectRatio = resolveImagenAspectRatio();

  try {
    const prefix = (process.env.GEMINI_IMAGE_PROMPT_PREFIX || '').trim();
    const promptForGemini = prefix ? `${prefix}\n\n${prompt}` : prompt;
    if (prefix) {
      logger.info('GEMINI_IMAGE_PROMPT_PREFIX is set; prefixing prompt for Gemini Imagen.');
    }

    logger.info(
      `Generating image with Gemini Imagen (model=${model}, size=${imageSize}, aspectRatio=${aspectRatio}): "${prompt}"`
    );

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
      model,
      prompt: promptForGemini,
      config: {
        numberOfImages,
        imageSize,
        aspectRatio,
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('No image data returned from Gemini Imagen');
    }

    const outputDir = getOutputDir();
    const timestamp = Date.now();
    const sanitizedPrompt = sanitizePromptForFilename(prompt);

    // Keep current contract (one image). If multiple are requested, save the first and log the rest.
    const first = response.generatedImages[0];
    const imageBytesBase64 = first?.image?.imageBytes;
    if (!imageBytesBase64) {
      throw new Error('No image bytes returned from Gemini Imagen');
    }

    const filename = `${timestamp}_${sanitizedPrompt}.png`;
    const filePath = path.join(outputDir, filename);
    const buffer = Buffer.from(imageBytesBase64, 'base64');
    fs.writeFileSync(filePath, buffer);

    if (response.generatedImages.length > 1) {
      logger.warn(
        `Gemini Imagen returned ${response.generatedImages.length} images; only the first one is being used (existing behavior).`
      );
    }

    logger.info(`Image generated successfully with Gemini Imagen: ${filePath}`);
    return filePath;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to generate image with Gemini Imagen:', errorMsg);
    throw new Error(`Image generation failed: ${errorMsg}`);
  }
}


