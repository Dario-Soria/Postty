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
import { getPromptTemplateReader } from './promptTemplateReader';

// Note: We use dynamic import for @google/generative-ai to support both libraries
// The @google/genai library doesn't support gemini-2.5-flash-image model

// Modelo Gemini 2.5 Flash Image (Nano Banana)
const NANO_BANANA_MODEL = 'gemini-2.5-flash-image';

/**
 * Build a descriptive font specification from typography style object
 * Format: "serif elegant (thin strokes, flowing style)"
 */
function buildFontDescription(style: any): string {
  const fontStyle = style.font_style || 'sans-serif';
  const fontCharacter = style.font_character || '';
  const fontNotes = style.font_specific_notes || '';
  
  let description = fontStyle;
  
  // Add character description if available (inline, not as a separate phrase)
  if (fontCharacter) {
    description += ` ${fontCharacter}`;
  }
  
  // Add specific notes in parentheses if available
  if (fontNotes) {
    description += ` (${fontNotes})`;
  }
  
  return description;
}

export interface NanoBananaInput {
  /** Path to reference image (from local folder) */
  referenceImagePath: string;
  /** Path to product image (from user upload) */
  productImagePath: string;
  /** User's intent/description for the generation */
  userIntent?: string;
  /** Output aspect ratio */
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
  
  // NEW: Text generation params
  /** User's text to display in the image */
  textContent?: string[];
  /** Typography style from design_guidelines */
  typographyStyle?: any;
  /** Product dominant colors for text contrast */
  productColors?: string[];
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
    textRequested?: number;
    textNote?: string;
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
  textContent?: string[];
  typographyStyle?: any;
  productColors?: string[];
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

  // Check if text generation is requested
  let basePrompt = '';
  
  if (params.textContent && params.textContent.length > 0) {
    // Text generation mode - include text in the image
    // Build text elements string with typography from design_guidelines
    let textElements = '';
    params.textContent.forEach((text, index) => {
      const style = index === 0 
        ? params.typographyStyle?.headline 
        : index === 1 
          ? params.typographyStyle?.subheadline 
          : params.typographyStyle?.badges;
      
      if (style) {
        textElements += `\nText ${index + 1}: "${text}"`;
        
        // Enhanced font description with character and specific notes
        const fontDesc = buildFontDescription(style);
        logger.info(`   📝 Text ${index + 1} font description: "${fontDesc}"`);
        logger.info(`   📝 Text ${index + 1} style object: ${JSON.stringify(style, null, 2)}`);
        textElements += `\n- Typography: ${fontDesc}`;
        
        textElements += `\n- Weight: ${style.font_weight || 'regular'}`;
        textElements += `\n- Case: ${style.case || 'normal'}`;
        textElements += `\n- Color: ${style.color || '#FFFFFF'}`;
        
        // More specific positioning with Y percentage
        if (style.position_y_percent) {
          textElements += `\n- Vertical Position: ${style.position_y_percent}% from top edge`;
        } else if (style.position) {
          textElements += `\n- Position: ${style.position}`;
        }
        
        textElements += `\n- Size: ${style.size || 'medium'} (relative to canvas)`;
        textElements += `\n- Alignment: ${style.alignment || 'center'}`;
        textElements += `\n- Letter Spacing: ${style.letter_spacing || 'normal'}`;
        
        // Add spacing guidance for subheadline
        if (index === 1 && style.spacing_from_headline) {
          textElements += `\n- Spacing: ${style.spacing_from_headline} gap from headline above`;
        }
        textElements += '\n';
      } else {
        textElements += `\nText ${index + 1}: "${text}"\n`;
      }
    });

    // Build product colors string
    let productColors = '';
    if (params.productColors && params.productColors.length > 0) {
      productColors = `PRODUCT DOMINANT COLORS: ${params.productColors.join(', ')}`;
    }

    // Use template reader to build final prompt from prompt.md
    const reader = getPromptTemplateReader();
    basePrompt = reader.buildPrompt({
      userIntent: params.userIntent || 'Professional product photography with elegant composition',
      sceneDescription,
      textElements,
      productColors,
      aspectRatio: params.aspectRatio,
    });

    logger.info(`📝 Nano Banana prompt built (WITH TEXT) from template:`);
    logger.info(`   - Text elements: ${params.textContent.length}`);
    logger.info(`   - Typography style provided: ${!!params.typographyStyle}`);
    
    // Save prompt to file for debugging
    const debugPromptPath = path.join(process.cwd(), 'temp-uploads', `prompt_${Date.now()}.txt`);
    fs.writeFileSync(debugPromptPath, basePrompt);
    logger.info(`📝 FULL PROMPT saved to: ${debugPromptPath}`);
    
    logger.info(`📝 FULL PROMPT being sent to Gemini:`);
    logger.info('═'.repeat(80));
    logger.info(basePrompt);
    logger.info('═'.repeat(80));
  } else {
    // No text mode - clean image
    basePrompt = `🚫🚫🚫 ABSOLUTELY NO TEXT IN THE OUTPUT IMAGE 🚫🚫🚫

CRITICAL RULE #1: The generated image MUST NOT contain ANY text, letters, words, numbers, symbols, buttons, CTAs, labels, or any written content whatsoever. This includes:
- NO "SHOP NOW" or any call-to-action buttons
- NO percentage signs like "65% OFF"  
- NO product names or brand names
- NO prices or numbers
- NO watermarks or logos
- NOTHING that can be read as text

The reference image may contain text - IGNORE IT COMPLETELY. DO NOT reproduce any text from the reference.

TASK: Create a promotional image following the user's EXACT scene description.

INPUTS:
1. REFERENCE IMAGE: Use ONLY for color palette, lighting mood, and style inspiration
   - Ignore any text, buttons, or overlays in reference
   
2. PRODUCT IMAGE: Study this product and RECREATE it in the scene. DO NOT paste or overlay this image. Generate a photorealistic version integrated naturally.

CRITICAL: The product image is PROVIDED AS REFERENCE ONLY. You must GENERATE the product in the scene, not paste the original image.

USER REQUEST: ${params.userIntent || 'Product photography'}

${sceneDescription}

OUTPUT REQUIREMENTS:
- ${params.aspectRatio} aspect ratio
- Photorealistic, high quality
- Product must be clearly visible and featured
- Follow the scene description EXACTLY
- Professional advertising quality
- 🚫 ZERO TEXT - completely clean image for text to be added later

Generate the image following the user's scene description with ABSOLUTELY NO TEXT OR WRITTEN ELEMENTS.`;
  }
  
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

  // Build prompt (with optional text parameters)
  const prompt = buildGenerationPrompt({
    userIntent: input.userIntent,
    aspectRatio,
    textContent: input.textContent,
    typographyStyle: input.typographyStyle,
    productColors: input.productColors,
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
      generationConfig: {
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
        // @ts-ignore - responseModalities es necesario para generación de imágenes
        responseModalities: ['image', 'text'],
      },
    });

    logger.info(`📤 Sending request to Nano Banana (${NANO_BANANA_MODEL})...`);
    const startTime = Date.now();

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    });

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
    
    // If ratio is significantly different, resize to target
    if (Math.abs(currentRatio - targetRatio) > 0.1) {
      logger.info(`🔄 Resizing image to match ${aspectRatio} aspect ratio...`);
      
      // For 9:16 (story), we need to make it taller
      // Strategy: resize to fit width, then extend height with content-aware fill or crop
      // Resize to target dimensions using cover fit
      const resizedBuffer = await sharp(imageBuffer)
        .resize(target.width, target.height, {
          fit: 'cover',
          position: 'center',
        })
        .png()
        .toBuffer();
      
      imageBuffer = Buffer.from(resizedBuffer);
      metadata = await sharp(imageBuffer).metadata();
      logger.info(`✅ Resized to: ${metadata.width}x${metadata.height}`);
    }
    
    fs.writeFileSync(outputPath, imageBuffer);
    const finalImageBase64 = imageBuffer.toString('base64');

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('✅ NANO BANANA - Base Image Generated Successfully');
    logger.info(`📁 Output: ${outputPath}`);
    logger.info(`📐 Dimensions: ${metadata.width}x${metadata.height}`);
    logger.info('═══════════════════════════════════════════════════════════════');

    // Add note about text generation if it was requested
    let textNote = undefined;
    if (input.textContent && input.textContent.length > 0) {
      textNote = `Text generation was requested (${input.textContent.length} elements). If text is not visible in the output, this may be a limitation of the ${NANO_BANANA_MODEL} model.`;
      logger.warn(`⚠️  ${textNote}`);
    }

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
        textRequested: input.textContent ? input.textContent.length : 0,
        textNote,
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

