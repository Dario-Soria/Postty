/**
 * Pipeline Orchestrator v2
 * 
 * Flow:
 * 1. Nano Banana → Base image (reference as INSPIRATION + product)
 * 2. Gemini → Professional text layout JSON
 * 3. Canvas Compositor → Final image with text
 */

import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { 
  generateBaseImage, 
  getRandomReferenceImage, 
  listReferenceImages,
  type NanoBananaOutput 
} from './nanoBananaGenerator';
import { 
  generateProfessionalLayout,
  generateFallbackLayout,
  type LayoutInput,
} from './textLayoutGenerator';
import { 
  composeWithCanvas,
  generateDefaultLayout,
  type CompositionLayout,
  type CompositorOutput 
} from './textCompositorPro';

export interface PipelineInput {
  productImagePath: string;
  referenceImagePath?: string;
  textPrompt: string;
  style?: string;
  useCase?: string;
  textContent?: {
    headline?: string;
    subheadline?: string;
    cta?: string;
  };
  textFormat?: string; // User's description of how they want text formatted
  language?: 'es' | 'en';
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
  skipText?: boolean;
  
  // NEW: Gemini text generation params
  userText?: string[];  // User's text array ["headline", "subheadline", "cta"]
  typographyStyle?: any;  // design_guidelines.typography from SQLite
  productAnalysis?: any;  // {colors, category, composition} from agent
}

export interface PipelineOutput {
  finalImagePath: string;
  finalImageBase64: string;
  baseImagePath: string;
  baseImageBase64: string;
  textLayout: CompositionLayout | null;
  metadata: {
    pipelineId: string;
    timestamp: number;
    duration: {
      total: number;
      nanoBanana: number;
      textLayout: number;
      composition: number;
    };
    inputs: {
      referenceImage: string;
      productImage: string;
      style: string;
      useCase: string;
    };
  };
}

function generatePipelineId(): string {
  return `pipeline_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function ensureReferenceFolder(): string {
  const dir = path.join(process.cwd(), 'reference-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Execute the complete pipeline
 */
export async function executePipeline(input: PipelineInput): Promise<PipelineOutput> {
  const pipelineId = generatePipelineId();
  const startTime = Date.now();

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('🚀 PIPELINE v2 - Starting');
  logger.info(`📋 ID: ${pipelineId}`);
  logger.info('═══════════════════════════════════════════════════════════════');

  ensureReferenceFolder();

  // Validate product image
  if (!fs.existsSync(input.productImagePath)) {
    throw new Error(`Product image not found: ${input.productImagePath}`);
  }

  const style = input.style || 'Elegante';
  const useCase = input.useCase || 'Promoción';

  // Get reference image based on style
  let referenceImagePath = input.referenceImagePath;
  if (!referenceImagePath) {
    // Try new reference library first
    const refLibPath = path.join(process.cwd(), 'reference-library', 'images');
    if (fs.existsSync(refLibPath)) {
      const files = fs.readdirSync(refLibPath).filter(f => 
        /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
      );
      if (files.length > 0) {
        // Pick a random reference from new library
        const randomFile = files[Math.floor(Math.random() * files.length)];
        referenceImagePath = path.join(refLibPath, randomFile);
        logger.info(`📚 Using random reference from library: ${randomFile}`);
      }
    }
    
    // Fall back to old reference system if needed
    if (!referenceImagePath) {
      const refs = listReferenceImages();
      const totalImages = Object.values(refs).flat().length;
      if (totalImages === 0) {
        throw new Error('No reference images found');
      }
      // Pass style to get reference from the correct folder
      referenceImagePath = getRandomReferenceImage(style);
    }
  }

  let nanoBananaDuration = 0;
  let textLayoutDuration = 0;
  let compositionDuration = 0;

  let nanoBananaResult: NanoBananaOutput;
  let layoutResult: CompositionLayout | null = null;
  let compositorResult: CompositorOutput;

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Nano Banana - Generate Base Image
    // ═══════════════════════════════════════════════════════════════
    logger.info('');
    logger.info('📸 STEP 1: Generating base image with Nano Banana...');
    
    const nbStart = Date.now();
    
    // Use the detailed textPrompt if provided, otherwise fall back to style/useCase
    const userIntent = input.textPrompt || `${style} style. ${useCase}. Professional advertising image.`;
    
    nanoBananaResult = await generateBaseImage({
      referenceImagePath,
      productImagePath: input.productImagePath,
      userIntent,
      aspectRatio: input.aspectRatio,
      // NEW: Pass text generation params if provided
      textContent: input.userText,
      typographyStyle: input.typographyStyle,
      productColors: input.productAnalysis?.colors,
    });
    
    nanoBananaDuration = Date.now() - nbStart;
    logger.info(`✅ Base image generated in ${nanoBananaDuration}ms`);

    // If no text requested OR text already included by Gemini, return image
    if (input.skipText || 
        (input.userText && input.userText.length > 0) ||  // Gemini generated text
        (!input.textContent || (!input.textContent.headline && !input.textContent.subheadline && !input.textContent.cta))) {
      
      logger.info('⏭️ No additional text overlay needed, returning image');
      
      return {
        finalImagePath: nanoBananaResult.imagePath,
        finalImageBase64: nanoBananaResult.imageBase64,
        baseImagePath: nanoBananaResult.imagePath,
        baseImageBase64: nanoBananaResult.imageBase64,
        textLayout: null,
        metadata: {
          pipelineId,
          timestamp: startTime,
          duration: {
            total: Date.now() - startTime,
            nanoBanana: nanoBananaDuration,
            textLayout: 0,
            composition: 0,
          },
          inputs: {
            referenceImage: path.basename(referenceImagePath),
            productImage: path.basename(input.productImagePath),
            style,
            useCase,
          },
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Generate Professional Text Layout
    // ═══════════════════════════════════════════════════════════════
    logger.info('');
    logger.info('📐 STEP 2: Generating text layout with Gemini...');
    
    const layoutStart = Date.now();
    
    // Parse textFormat into structured format if provided
    let textFormatParsed: { headlineSize?: 'small' | 'medium' | 'large' | 'xlarge'; subheadlineSize?: 'small' | 'medium' | 'large' } | undefined;
    if (input.textFormat) {
      const fmt = input.textFormat.toLowerCase();
      if (fmt.includes('grande') || fmt.includes('big') || fmt.includes('large')) {
        textFormatParsed = { headlineSize: 'xlarge', subheadlineSize: 'medium' };
      } else {
        textFormatParsed = { headlineSize: 'large', subheadlineSize: 'medium' };
      }
    }

    // Read reference image for text style analysis
    let referenceImageBase64: string | undefined;
    if (referenceImagePath && fs.existsSync(referenceImagePath)) {
      try {
        const refBuffer = fs.readFileSync(referenceImagePath);
        referenceImageBase64 = refBuffer.toString('base64');
        logger.info(`📷 Reference image loaded for text style analysis: ${referenceImagePath}`);
      } catch (e) {
        logger.warn('Could not load reference image for text analysis');
      }
    }

    const layoutInput: LayoutInput = {
      textContent: input.textContent,
      textFormat: textFormatParsed,
      style,
      useCase,
      imageWidth: nanoBananaResult.width,
      imageHeight: nanoBananaResult.height,
      imageBase64: nanoBananaResult.imageBase64, // Generated image for analysis
      referenceImageBase64, // Reference image to copy text style from
      imageTheme: 'dark', // Assume dark for now
      language: input.language || 'es',
    };

    try {
      layoutResult = await generateProfessionalLayout(layoutInput);
    } catch (e) {
      logger.warn('Gemini layout failed, using fallback');
      layoutResult = generateFallbackLayout(input.textContent, style);
    }
    
    // CRITICAL: Filter out any CTA if user didn't request one
    const userRequestedCta = input.textContent.cta && input.textContent.cta.trim().length > 0;
    if (!userRequestedCta && layoutResult.elements) {
      const beforeCount = layoutResult.elements.length;
      layoutResult.elements = layoutResult.elements.filter(el => el.type !== 'cta');
      if (layoutResult.elements.length < beforeCount) {
        logger.warn('⚠️ Removed CTA that was not requested by user');
      }
    }
    
    textLayoutDuration = Date.now() - layoutStart;
    logger.info(`✅ Layout generated in ${textLayoutDuration}ms (${layoutResult.elements.length} elements)`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Compose Final Image with Canvas
    // ═══════════════════════════════════════════════════════════════
    logger.info('');
    logger.info('🎨 STEP 3: Composing final image with Canvas...');
    
    const compStart = Date.now();
    
    compositorResult = await composeWithCanvas({
      baseImagePath: nanoBananaResult.imagePath,
      layout: layoutResult,
      outputFormat: 'png',
      quality: 95,
    });
    
    compositionDuration = Date.now() - compStart;
    logger.info(`✅ Composition complete in ${compositionDuration}ms`);

    const totalDuration = Date.now() - startTime;

    logger.info('');
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('✅ PIPELINE v2 - Complete');
    logger.info(`⏱️ Total: ${totalDuration}ms`);
    logger.info(`   Nano Banana: ${nanoBananaDuration}ms`);
    logger.info(`   Text Layout: ${textLayoutDuration}ms`);
    logger.info(`   Composition: ${compositionDuration}ms`);
    logger.info(`📁 Final: ${compositorResult.imagePath}`);
    logger.info('═══════════════════════════════════════════════════════════════');

    return {
      finalImagePath: compositorResult.imagePath,
      finalImageBase64: compositorResult.imageBase64,
      baseImagePath: nanoBananaResult.imagePath,
      baseImageBase64: nanoBananaResult.imageBase64,
      textLayout: layoutResult,
      metadata: {
        pipelineId,
        timestamp: startTime,
        duration: {
          total: totalDuration,
          nanoBanana: nanoBananaDuration,
          textLayout: textLayoutDuration,
          composition: compositionDuration,
        },
        inputs: {
          referenceImage: path.basename(referenceImagePath),
          productImage: path.basename(input.productImagePath),
          style,
          useCase,
        },
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('═══════════════════════════════════════════════════════════════');
    logger.error('❌ PIPELINE v2 - Failed');
    logger.error(`Error: ${msg}`);
    logger.error('═══════════════════════════════════════════════════════════════');
    throw new Error(`Pipeline failed: ${msg}`);
  }
}

export function getAvailableReferences(): { style: string; images: string[] }[] {
  ensureReferenceFolder();
  const refs = listReferenceImages();
  return Object.entries(refs).map(([style, images]) => ({ style, images }));
}

export function isPipelineReady(): { ready: boolean; message: string } {
  // Check GEMINI_API_KEY
  if (!process.env.GEMINI_API_KEY) {
    return { ready: false, message: 'GEMINI_API_KEY not set' };
  }
  
  // Check for reference images in both old and new systems
  const refLibPath = path.join(process.cwd(), 'reference-library', 'images');
  const oldRefPath = path.join(process.cwd(), 'reference-images');
  
  let hasReferences = false;
  let totalImages = 0;
  
  // Check new reference library
  if (fs.existsSync(refLibPath)) {
    const files = fs.readdirSync(refLibPath).filter(f => 
      /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
    );
    totalImages += files.length;
    hasReferences = files.length > 0;
  }
  
  // Fall back to old reference system
  if (!hasReferences) {
    ensureReferenceFolder();
    const refs = listReferenceImages();
    totalImages = Object.values(refs).flat().length;
    hasReferences = totalImages > 0;
  }
  
  if (!hasReferences) {
    return { ready: false, message: 'No reference images found' };
  }
  
  return { ready: true, message: `Ready with ${totalImages} reference(s)` };
}
