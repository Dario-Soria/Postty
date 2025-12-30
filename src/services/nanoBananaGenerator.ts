/**
 * Nano Banana Image Generator
 * Uses gemini-2.5-flash-image for image-conditioned generation
 * 
 * This service generates clean base images (no text) using:
 * - A reference image from local storage
 * - A product image from user input
 */

import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';

// Note: We use dynamic import for @google/generative-ai to support both libraries
// The @google/genai library doesn't support gemini-2.5-flash-image model

// Modelo Gemini 2.5 Flash Image (Nano Banana)
const NANO_BANANA_MODEL = 'gemini-2.5-flash-image';

export interface NanoBananaInput {
  /** Path to reference image (from local folder) */
  referenceImagePath: string;
  /** Path to product image (from user upload) */
  productImagePath: string;
  /** User's intent/description for the generation */
  userIntent?: string;
  /** Output aspect ratio */
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
}

export interface NanoBananaOutput {
  /** Path to generated base image */
  imagePath: string;
  /** Base64 encoded image data */
  imageBase64: string;
  /** Image dimensions */
  width: number;
  height: number;
  /** Generation metadata */
  metadata: {
    model: string;
    timestamp: number;
    referenceUsed: string;
    productUsed: string;
  };
}

function requireApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  return apiKey;
}

function getOutputDir(): string {
  const outputDir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

function imageToBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Build the generation prompt for Nano Banana
 * Key constraint: Reference is STYLE INSPIRATION only, create ORIGINAL scene
 */
function buildGenerationPrompt(params: {
  userIntent?: string;
  aspectRatio: string;
}): string {
  // Parse user intent to detect scene requirements
  const intent = params.userIntent?.toLowerCase() || '';
  const wantsPerson = intent.includes('persona') || intent.includes('alguien') || intent.includes('modelo') || intent.includes('usando');
  const hasLocation = intent.includes('italia') || intent.includes('paris') || intent.includes('playa') || 
                      intent.includes('calle') || intent.includes('ciudad') || intent.includes('cafe');
  
  // Build scene description based on user intent
  let sceneDescription = '';
  if (wantsPerson && hasLocation) {
    sceneDescription = `SCENE: Create a lifestyle image with a stylish person WEARING/USING the product. Location: ${params.userIntent}. The person should be elegantly dressed and the setting should match the location described.`;
  } else if (wantsPerson) {
    sceneDescription = `SCENE: Create a lifestyle image with a stylish person WEARING/USING the product in an elegant setting.`;
  } else if (hasLocation) {
    sceneDescription = `SCENE: Show the product in the following setting: ${params.userIntent}`;
  } else {
    sceneDescription = `SCENE: Clean product photography with minimal background.`;
  }

  const basePrompt = `🚫 NO TEXT IN IMAGE 🚫

I'm providing you TWO images:
1. REFERENCE: Use for STYLE/MOOD only (colors, lighting, vibe)
2. PRODUCT: This EXACT item MUST appear in the final image!

THE PRODUCT (second image) IS THE MAIN SUBJECT. 
- If it's FOOTWEAR (shoes, sandals, clogs, zuecos): Show a person WEARING THEM. Feet must be visible with the EXACT product on.
- If it's CLOTHING: Show a person WEARING IT.
- If it's an ACCESSORY: Show a person USING IT prominently.

🎯 USER'S SCENE REQUEST: ${params.userIntent || 'Product photography'}

${sceneDescription}

MANDATORY CHECKLIST:
✅ The EXACT product from image #2 must be clearly visible
✅ If footwear: person's feet MUST be shown wearing the product
✅ High quality, photorealistic
✅ NO text, NO logos, NO watermarks - clean image only

📐 COMPOSITION - VERY IMPORTANT:

🎯 CENTER ZONE (Important content - DO NOT crop):
- The person and product MUST be in the CENTER of the image
- Leave a "safe zone" in the middle where ALL important content lives
- The subject should occupy roughly the central 60-70% of the frame

🌅 OUTER ZONE (Background/filler - can be cropped):
- The edges/borders should contain only BACKGROUND elements
- Scenery, environment, sky, floor - content that can be cropped without losing anything important
- NO important body parts or product at the edges

This allows the image to be cropped to different aspect ratios without losing the main subject.

✅ Full body visible - head to toe
✅ Person + product centered both horizontally AND vertically
✅ Background extends to fill the entire frame
✅ Photorealistic, high quality

❌ DO NOT place person/product near edges
❌ DO NOT crop the product
❌ DO NOT cut off feet, hands, or head

Generate a well-composed promotional image with THE PRODUCT centered and background extending to all edges.`;
  
  logger.info(`📝 Nano Banana prompt built:`);
  logger.info(`   - Wants person: ${wantsPerson}`);
  logger.info(`   - Has location: ${hasLocation}`);
  logger.info(`   - Scene: ${sceneDescription}`);

  return basePrompt;
}

/**
 * Extract image from Nano Banana response
 */
function extractImageFromResponse(response: any): string | null {
  // Strategy 1: candidates[0].content.parts[].inlineData.data
  try {
    const candidates = response?.candidates;
    if (candidates && Array.isArray(candidates)) {
      for (const candidate of candidates) {
        const parts = candidate?.content?.parts || [];
        for (const part of parts) {
          if (part?.inlineData?.data && typeof part.inlineData.data === 'string' && part.inlineData.data.length > 100) {
            logger.info('✅ Image found in candidates[].content.parts[].inlineData.data');
            return part.inlineData.data;
          }
          // Alternative format: inline_data
          if (part?.inline_data?.data && typeof part.inline_data.data === 'string' && part.inline_data.data.length > 100) {
            logger.info('✅ Image found in candidates[].content.parts[].inline_data.data');
            return part.inline_data.data;
          }
        }
      }
    }
  } catch (e) {
    logger.warn('extractImageFromResponse: candidates path error');
  }

  // Strategy 2: output[0].inlineData
  try {
    if (response?.output?.[0]?.inlineData?.data) {
      logger.info('✅ Image found in output[0].inlineData.data');
      return response.output[0].inlineData.data;
    }
  } catch (e) {
    logger.warn('extractImageFromResponse: output path error');
  }

  return null;
}

/**
 * Generate base image using Nano Banana (gemini-2.5-flash-image)
 * 
 * @param input - Generation parameters
 * @returns Generated image data and metadata
 */
export async function generateBaseImage(input: NanoBananaInput): Promise<NanoBananaOutput> {
  const apiKey = requireApiKey();
  const aspectRatio = input.aspectRatio || '1:1';

  // Validate input files exist
  if (!fs.existsSync(input.referenceImagePath)) {
    throw new Error(`Reference image not found: ${input.referenceImagePath}`);
  }
  if (!fs.existsSync(input.productImagePath)) {
    throw new Error(`Product image not found: ${input.productImagePath}`);
  }

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('🍌 NANO BANANA - Generating Base Image');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`📷 Reference: ${input.referenceImagePath}`);
  logger.info(`📦 Product: ${input.productImagePath}`);
  logger.info(`📐 Aspect Ratio: ${aspectRatio}`);
  logger.info(`💬 User Intent: ${input.userIntent || '(none)'}`);

  // Prepare images as base64
  const referenceBase64 = imageToBase64(input.referenceImagePath);
  const productBase64 = imageToBase64(input.productImagePath);
  const referenceMime = guessMimeType(input.referenceImagePath);
  const productMime = guessMimeType(input.productImagePath);

  // Build prompt
  const prompt = buildGenerationPrompt({
    userIntent: input.userIntent,
    aspectRatio,
  });

  // Build parts for generation
  const parts = [
    { text: prompt },
    { 
      inlineData: { 
        mimeType: referenceMime, 
        data: referenceBase64 
      } 
    },
    { 
      inlineData: { 
        mimeType: productMime, 
        data: productBase64 
      } 
    },
  ];

  try {
    // Dynamic import of @google/generative-ai
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: NANO_BANANA_MODEL,
    });
    
    logger.info(`📐 Requesting aspectRatio: ${aspectRatio}`);

    logger.info(`📤 Sending request to Nano Banana (${NANO_BANANA_MODEL})...`);
    const startTime = Date.now();

    // Pass imageConfig in the request for native aspect ratio support
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.4,
        responseModalities: ['image', 'text'],
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    } as any);

    const response = await result.response;
    const duration = Date.now() - startTime;

    logger.info(`✅ Response received in ${duration}ms`);

    // Check for safety blocks
    if (response.candidates?.[0]?.finishReason) {
      const finishReason = response.candidates[0].finishReason;
      if (finishReason === 'SAFETY') {
        throw new Error('Content blocked by Google AI safety filters');
      }
      if (finishReason === 'RECITATION') {
        throw new Error('Content blocked by recitation policy');
      }
    }

    // Log full response structure for debugging
    logger.info('📋 Response structure:');
    logger.info(`   - candidates: ${response.candidates?.length || 0}`);
    if (response.candidates?.[0]) {
      const cand = response.candidates[0];
      logger.info(`   - finishReason: ${cand.finishReason}`);
      logger.info(`   - content.parts: ${cand.content?.parts?.length || 0}`);
      if (cand.content?.parts) {
        cand.content.parts.forEach((p: any, i: number) => {
          if (p.text) logger.info(`   - part[${i}]: text (${p.text.length} chars)`);
          if (p.inlineData) logger.info(`   - part[${i}]: inlineData (${p.inlineData.data?.length || 0} chars, mime: ${p.inlineData.mimeType})`);
        });
      }
    }
    logger.info(`   - text(): ${response.text()?.slice(0, 200) || '(empty)'}`);

    // Extract image from response
    const imageBase64 = extractImageFromResponse(response);

    if (!imageBase64 || imageBase64.length < 100) {
      logger.error('No valid image data in response');
      logger.error('Full response JSON:', JSON.stringify(response, null, 2).slice(0, 2000));
      throw new Error('No valid image returned from Nano Banana');
    }

    // Save image to disk
    const outputDir = getOutputDir();
    const timestamp = Date.now();
    const filename = `${timestamp}_nanobanana_base.png`;
    const outputPath = path.join(outputDir, filename);

    let imageBuffer: Buffer = Buffer.from(imageBase64, 'base64');
    
    // Get image dimensions using sharp
    const sharp = (await import('sharp')).default;
    let metadata = await sharp(imageBuffer).metadata();
    
    // FORCE correct aspect ratio by cropping/resizing
    const targetRatios: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1080, height: 1080 },
      '9:16': { width: 1080, height: 1920 },  // Story format
      '16:9': { width: 1920, height: 1080 },
      '4:3': { width: 1440, height: 1080 },
      '3:4': { width: 1080, height: 1440 },
    };
    
    const target = targetRatios[aspectRatio] || targetRatios['1:1'];
    const currentRatio = (metadata.width || 1) / (metadata.height || 1);
    const targetRatio = target.width / target.height;
    
    logger.info(`📐 Current image: ${metadata.width}x${metadata.height} (ratio: ${currentRatio.toFixed(2)})`);
    logger.info(`📐 Target: ${target.width}x${target.height} (ratio: ${targetRatio.toFixed(2)})`);
    
    // Only resize if absolutely necessary (Gemini should generate correct aspect ratio natively)
    if (Math.abs(currentRatio - targetRatio) > 0.15) {
      logger.warn(`⚠️ Gemini generated wrong aspect ratio. Current: ${currentRatio.toFixed(2)}, Target: ${targetRatio.toFixed(2)}`);
      logger.info(`🔄 Resizing to correct aspect ratio...`);
      
      // Use cover fit as fallback
      const resizedBuffer = await sharp(imageBuffer)
        .resize(target.width, target.height, {
          fit: 'cover',
          position: 'center',
        })
        .png()
        .toBuffer();
      
      imageBuffer = Buffer.from(resizedBuffer);
      metadata = await sharp(imageBuffer).metadata();
      logger.info(`✅ Fallback resize to: ${metadata.width}x${metadata.height}`);
    } else {
      logger.info(`✅ Gemini generated correct aspect ratio natively!`);
    }
    
    fs.writeFileSync(outputPath, imageBuffer);
    const finalImageBase64 = imageBuffer.toString('base64');

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('✅ NANO BANANA - Base Image Generated Successfully');
    logger.info(`📁 Output: ${outputPath}`);
    logger.info(`📐 Dimensions: ${metadata.width}x${metadata.height}`);
    logger.info('═══════════════════════════════════════════════════════════════');

    return {
      imagePath: outputPath,
      imageBase64: finalImageBase64,
      width: metadata.width || 1080,
      height: metadata.height || 1080,
      metadata: {
        model: NANO_BANANA_MODEL,
        timestamp,
        referenceUsed: path.basename(input.referenceImagePath),
        productUsed: path.basename(input.productImagePath),
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('═══════════════════════════════════════════════════════════════');
    logger.error('❌ NANO BANANA - Generation Failed');
    logger.error(`Error: ${errorMsg}`);
    logger.error('═══════════════════════════════════════════════════════════════');
    throw new Error(`Nano Banana generation failed: ${errorMsg}`);
  }
}

/**
 * Map style names to folder names
 */
function getStyleFolderName(style: string): string {
  const styleMap: Record<string, string> = {
    'old money': 'old-money',
    'oldmoney': 'old-money',
    'minimalista': 'minimalista',
    'minimalist': 'minimalista',
    'vibrante': 'vibrante',
    'vibrant': 'vibrante',
    'elegante': 'elegante',
    'elegant': 'elegante',
    'urbano': 'urbano',
    'urban': 'urbano',
    'moderno': 'moderno',
    'modern': 'moderno',
  };
  
  const normalized = style.toLowerCase().trim();
  return styleMap[normalized] || 'moderno'; // default to moderno
}

/**
 * Get a random reference image from the style-specific folder
 * Falls back to any folder with images if style folder is empty
 */
export function getRandomReferenceImage(style?: string): string {
  const baseDir = path.join(process.cwd(), 'reference-images');
  const styleFolders = ['old-money', 'minimalista', 'vibrante', 'elegante', 'urbano', 'moderno'];
  
  // Try style-specific folder first
  if (style) {
    const styleFolderName = getStyleFolderName(style);
    const styleDir = path.join(baseDir, styleFolderName);
    
    if (fs.existsSync(styleDir)) {
      const images = fs.readdirSync(styleDir).filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
      });
      
      if (images.length > 0) {
        const randomIndex = Math.floor(Math.random() * images.length);
        logger.info(`📁 Using ${styleFolderName} reference: ${images[randomIndex]}`);
        return path.join(styleDir, images[randomIndex]);
      }
    }
    logger.warn(`⚠️ No images in ${styleFolderName} folder, searching other folders...`);
  }
  
  // Fallback: search ALL style folders for any image
  for (const folder of styleFolders) {
    const folderPath = path.join(baseDir, folder);
    if (fs.existsSync(folderPath)) {
      const images = fs.readdirSync(folderPath).filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
      });
      
      if (images.length > 0) {
        const randomIndex = Math.floor(Math.random() * images.length);
        logger.info(`📁 Fallback: Using ${folder} reference: ${images[randomIndex]}`);
        return path.join(folderPath, images[randomIndex]);
      }
    }
  }
  
  // Last resort: check root reference-images
  if (fs.existsSync(baseDir)) {
    const images = fs.readdirSync(baseDir).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    });

    if (images.length > 0) {
      const randomIndex = Math.floor(Math.random() * images.length);
      logger.info(`📁 Fallback: Using root reference: ${images[randomIndex]}`);
      return path.join(baseDir, images[randomIndex]);
    }
  }

  throw new Error('No reference images found in any folder');
}

/**
 * List all available reference images by style
 */
export function listReferenceImages(): Record<string, string[]> {
  const baseDir = path.join(process.cwd(), 'reference-images');
  
  if (!fs.existsSync(baseDir)) {
    return {};
  }

  const result: Record<string, string[]> = {};
  const styles = ['old-money', 'minimalista', 'vibrante', 'elegante', 'urbano', 'moderno'];
  
  for (const style of styles) {
    const styleDir = path.join(baseDir, style);
    if (fs.existsSync(styleDir)) {
      result[style] = fs.readdirSync(styleDir)
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
        });
    }
  }
  
  return result;
}

