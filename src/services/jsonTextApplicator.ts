/**
 * JSON Text Applicator
 * Applies reference JSON text layout directly to a base image
 * Replaces text content while preserving all styling from the JSON
 */

import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import {
  composeWithCanvas,
  type TextElement,
  type CompositionLayout,
  type CompositorOutput,
} from './textCompositorPro';

/**
 * Reference JSON format (from reference-library/Jsons/)
 */
export interface ReferenceJSON {
  canvas: {
    width: number;
    height: number;
  };
  texts: Array<{
    id: string;
    content: string;
    font: {
      family: string;
      weight: number;
      style: string;
    };
    size_px: number;
    color: string;
    alignment?: string;
    letter_spacing?: number;
    position: {
      x: number; // 0-1 ratio
      y: number; // 0-1 ratio
    };
    max_width?: number; // 0-1 ratio
    background_box?: {
      color: string;
      padding_px: number;
    };
  }>;
}

/**
 * Convert reference JSON to CompositionLayout format for text compositor
 */
function convertReferenceJSONToLayout(
  refJSON: ReferenceJSON,
  userTextArray: string[]
): CompositionLayout {
  logger.info('📋 Converting reference JSON to composition layout');
  logger.info(`   User texts: ${JSON.stringify(userTextArray)}`);
  logger.info(`   JSON texts count: ${refJSON.texts.length}`);

  const elements: TextElement[] = refJSON.texts.map((textSpec, index) => {
    // Replace content with user's text (by position)
    const userText = userTextArray[index] || textSpec.content;
    
    logger.info(`   Element ${index}: "${userText}" (${textSpec.font.family} ${textSpec.size_px}px)`);

    // Determine element type based on ID or position
    let type: 'headline' | 'subheadline' | 'cta' | 'body' = 'body';
    const idLower = textSpec.id.toLowerCase();
    if (idLower.includes('title') || idLower.includes('headline') || index === 0) {
      type = 'headline';
    } else if (idLower.includes('subtitle') || idLower.includes('subheadline') || idLower.includes('offer')) {
      type = 'subheadline';
    } else if (idLower.includes('cta') || idLower.includes('button') || idLower.includes('action')) {
      type = 'cta';
    }

    // Map alignment
    const anchor = textSpec.alignment === 'center' ? 'center' :
                   textSpec.alignment === 'right' ? 'right' : 'left';

    // Map font weight to string format
    const fontWeight = textSpec.font.weight.toString() as any;

    // Build text element
    const element: TextElement = {
      text: userText,
      type,
      position: {
        x: textSpec.position.x * 100, // Convert 0-1 to 0-100
        y: textSpec.position.y * 100,
        anchor,
      },
      style: {
        fontFamily: textSpec.font.family,
        fontSize: textSpec.size_px,
        fontWeight,
        color: textSpec.color,
        letterSpacing: textSpec.letter_spacing,
        textTransform: 'none',
      },
    };

    // Add max width if specified
    if (textSpec.max_width) {
      element.style.maxWidth = textSpec.max_width * 100; // Convert to percentage
    }

    // Add background box if specified
    if (textSpec.background_box) {
      element.style.background = {
        color: textSpec.background_box.color,
        paddingX: textSpec.background_box.padding_px,
        paddingY: textSpec.background_box.padding_px,
        borderRadius: 0,
      };
    }

    return element;
  });

  return {
    elements,
    theme: 'auto',
  };
}

/**
 * Apply reference JSON text layout to a base image
 */
export async function applyReferenceJSON(
  baseImagePath: string,
  referenceJSONPath: string,
  userTextArray: string[]
): Promise<CompositorOutput> {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('📝 JSON TEXT APPLICATOR - Applying Reference JSON');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`📷 Base image: ${baseImagePath}`);
  logger.info(`📄 Reference JSON: ${referenceJSONPath}`);
  logger.info(`✏️  User texts: ${JSON.stringify(userTextArray)}`);

  // Validate base image exists
  if (!fs.existsSync(baseImagePath)) {
    throw new Error(`Base image not found: ${baseImagePath}`);
  }

  // Validate and load reference JSON
  if (!fs.existsSync(referenceJSONPath)) {
    throw new Error(`Reference JSON not found: ${referenceJSONPath}`);
  }

  const refJSON: ReferenceJSON = JSON.parse(
    fs.readFileSync(referenceJSONPath, 'utf-8')
  );

  logger.info(`📐 Canvas size: ${refJSON.canvas.width}x${refJSON.canvas.height}`);
  logger.info(`📝 Text elements in JSON: ${refJSON.texts.length}`);

  // Convert reference JSON to composition layout
  const layout = convertReferenceJSONToLayout(refJSON, userTextArray);

  logger.info(`✅ Converted to ${layout.elements.length} text elements`);

  // Apply text to base image using compositor
  logger.info('🎨 Calling text compositor...');
  const result = await composeWithCanvas({
    baseImagePath,
    layout,
    outputFormat: 'png',
    quality: 95,
  });

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('✅ JSON TEXT APPLICATION - Complete');
  logger.info(`📁 Final image: ${result.imagePath}`);
  logger.info('═══════════════════════════════════════════════════════════════');

  return result;
}

/**
 * Load reference JSON for a given reference filename
 */
export function loadReferenceJSON(referenceFilename: string): ReferenceJSON | null {
  try {
    // Get base name without extension
    const baseName = path.parse(referenceFilename).name;
    
    // Build JSON path
    const jsonPath = path.join(
      process.cwd(),
      'reference-library',
      'Jsons',
      `${baseName}.json`
    );

    if (!fs.existsSync(jsonPath)) {
      logger.warn(`No JSON found for reference: ${referenceFilename}`);
      return null;
    }

    const json: ReferenceJSON = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    logger.info(`✅ Loaded reference JSON: ${baseName}.json`);
    return json;
  } catch (e) {
    logger.error(`Error loading reference JSON: ${e}`);
    return null;
  }
}

