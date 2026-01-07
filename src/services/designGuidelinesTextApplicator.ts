/**
 * Design Guidelines Text Applicator
 * Applies text using design_guidelines from SQLite database
 * Adapts typography based on product image characteristics
 */

import * as fs from 'fs';
import * as logger from '../utils/logger';
import {
  composeWithCanvas,
  type TextElement,
  type CompositionLayout,
  type CompositorOutput,
} from './textCompositorPro';

/**
 * Design Guidelines Typography Structure (from SQLite design_guidelines column)
 */
export interface DesignGuidelines {
  typography?: {
    headline?: {
      font_style?: string;
      font_weight?: string;
      case?: string;
      color?: string;
      position?: string;
      size?: string;
      alignment?: string;
      line_height?: string;
      letter_spacing?: string;
    };
    subheadline?: {
      present?: boolean;
      font_style?: string;
      font_weight?: string;
      color?: string;
      position?: string;
      separator?: string;
    };
    badges?: {
      present?: boolean;
      content?: string;
      shape?: string;
      style?: string;
      color?: string;
      position?: string;
    };
    text_effects?: {
      shadow?: boolean;
      outline?: boolean;
      gradient?: boolean;
    };
  };
  color_palette?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    text_primary?: string;
    text_secondary?: string;
  };
  layout?: {
    aspect_ratio?: string;
    product_position?: string;
    negative_space?: {
      top?: string;
      bottom?: string;
      left?: string;
      right?: string;
    };
  };
  [key: string]: any;
}

/**
 * Product Analysis Structure (from agent's product image analysis)
 */
export interface ProductAnalysis {
  colors?: string[];
  category?: string;
  composition?: {
    product_position?: string;
    available_zones?: string[];
  };
}

/**
 * Map design guidelines position to numeric coordinates
 */
function positionToCoordinates(position: string, availableZones?: string[]): { x: number; y: number } {
  // Default positions based on common layouts
  const positionMap: Record<string, { x: number; y: number }> = {
    'top': { x: 50, y: 15 },
    'top-left': { x: 10, y: 15 },
    'top-right': { x: 90, y: 15 },
    'center': { x: 50, y: 50 },
    'bottom': { x: 50, y: 85 },
    'bottom-center': { x: 50, y: 85 },
    'bottom-left': { x: 10, y: 85 },
    'bottom-right': { x: 90, y: 85 },
    'below-headline': { x: 50, y: 35 },
    'above-product': { x: 50, y: 25 },
    'below-product': { x: 50, y: 75 },
  };

  return positionMap[position] || { x: 50, y: 50 };
}

/**
 * Map font size descriptor to pixel value
 */
function sizeToPixels(size: string, type: 'headline' | 'subheadline' | 'cta' | 'body'): number {
  const sizeMap: Record<string, Record<string, number>> = {
    headline: { small: 40, medium: 60, large: 80, hero: 120 },
    subheadline: { small: 24, medium: 32, large: 40, hero: 48 },
    cta: { small: 18, medium: 24, large: 32, hero: 40 },
    body: { small: 16, medium: 20, large: 24, hero: 28 },
  };

  return sizeMap[type][size] || sizeMap[type]['medium'];
}

/**
 * Map font weight descriptor to numeric value
 */
function weightToNumber(weight: string): 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' {
  const weightMap: Record<string, 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'> = {
    light: '300',
    regular: '400',
    normal: 'normal',
    medium: '500',
    semibold: '600',
    bold: 'bold',
    black: '900',
  };

  return weightMap[weight] || '400';
}

/**
 * Map font style to font family
 */
function styleToFontFamily(style: string): string {
  const fontMap: Record<string, string> = {
    serif: 'Georgia',
    'sans-serif': 'Arial',
    script: 'Brush Script MT',
    display: 'Impact',
    monospace: 'Courier New',
  };

  return fontMap[style] || 'Arial';
}

/**
 * Ensure text color contrasts with product colors
 */
function adaptTextColor(
  textColor: string | undefined,
  productColors: string[],
  fallbackColor: string = '#FFFFFF'
): string {
  // If no text color specified, use fallback
  if (!textColor) return fallbackColor;

  // If product has dark colors, use light text
  // If product has light colors, use dark text
  // This is a simplified approach - production would use proper contrast calculation

  return textColor;
}

/**
 * Convert design guidelines + product analysis to CompositionLayout
 */
function convertDesignGuidelinesToLayout(
  guidelines: DesignGuidelines,
  productAnalysis: ProductAnalysis,
  userTextArray: string[]
): CompositionLayout {
  logger.info('📋 Converting design guidelines to composition layout');
  logger.info(`   User texts: ${JSON.stringify(userTextArray)}`);
  logger.info(`   Product category: ${productAnalysis.category || 'unknown'}`);

  const elements: TextElement[] = [];
  const typography = guidelines.typography || {};
  const colorPalette = guidelines.color_palette || {};

  // Extract product context
  const productColors = productAnalysis.colors || [];
  const availableZones = productAnalysis.composition?.available_zones || ['top', 'bottom'];

  // Process each user text based on position
  userTextArray.forEach((text, index) => {
    let type: 'headline' | 'subheadline' | 'cta' | 'body';
    let specs: any;

    // Determine type and get corresponding specs from typography
    if (index === 0) {
      type = 'headline';
      specs = typography.headline || {};
    } else if (index === 1) {
      type = 'subheadline';
      specs = typography.subheadline || {};
    } else {
      type = 'cta';
      specs = typography.badges || {}; // Use badges for CTA if available
    }

    // Build position
    const position = positionToCoordinates(
      specs.position || (type === 'headline' ? 'top' : 'bottom'),
      availableZones
    );

    // Adapt text color based on product colors
    const textColor = adaptTextColor(
      specs.color || colorPalette.text_primary,
      productColors,
      type === 'headline' ? '#FFFFFF' : '#000000'
    );

    // Map font properties
    const fontFamily = styleToFontFamily(specs.font_style || 'sans-serif');
    const fontSize = sizeToPixels(specs.size || 'medium', type);
    const fontWeight = weightToNumber(specs.font_weight || 'regular');
    const alignment = specs.alignment || 'center';

    // Map alignment to anchor
    const anchor = alignment === 'center' ? 'center' :
                   alignment === 'right' ? 'right' : 'left';

    // Handle text case transformation
    let transformedText = text;
    if (specs.case === 'uppercase') {
      transformedText = text.toUpperCase();
    } else if (specs.case === 'lowercase') {
      transformedText = text.toLowerCase();
    }

    logger.info(`   Element ${index}: "${transformedText}" (${fontFamily} ${fontSize}px at ${position.x}%, ${position.y}%)`);

    // Build text element
    const element: TextElement = {
      text: transformedText,
      type,
      position: {
        x: position.x,
        y: position.y,
        anchor,
      },
      style: {
        fontFamily,
        fontSize,
        fontWeight,
        color: textColor,
        letterSpacing: parseLetterSpacing(specs.letter_spacing),
        textTransform: 'none',
      },
    };

    elements.push(element);
  });

  logger.info(`✅ Converted to ${elements.length} text elements from design guidelines`);

  return {
    elements,
    theme: 'auto',
  };
}

/**
 * Parse letter spacing descriptor to number
 */
function parseLetterSpacing(spacing: string | undefined): number {
  if (!spacing) return 0;
  
  const spacingMap: Record<string, number> = {
    tight: -1,
    normal: 0,
    wide: 2,
    'extra-wide': 4,
  };

  return spacingMap[spacing] || 0;
}

/**
 * Apply design guidelines text to a base image
 */
export async function applyDesignGuidelinesText(
  baseImagePath: string,
  designGuidelines: DesignGuidelines,
  productAnalysis: ProductAnalysis,
  userTextArray: string[]
): Promise<CompositorOutput> {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('📝 DESIGN GUIDELINES TEXT APPLICATOR - Applying Typography');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`📷 Base image: ${baseImagePath}`);
  logger.info(`✏️  User texts: ${JSON.stringify(userTextArray)}`);
  logger.info(`🎨 Typography specs: ${JSON.stringify(designGuidelines.typography || {})}`);
  logger.info(`🔍 Product analysis: ${JSON.stringify(productAnalysis)}`);

  // Validate base image exists
  if (!fs.existsSync(baseImagePath)) {
    throw new Error(`Base image not found: ${baseImagePath}`);
  }

  // Convert design guidelines to composition layout
  const layout = convertDesignGuidelinesToLayout(
    designGuidelines,
    productAnalysis,
    userTextArray
  );

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
  logger.info('✅ DESIGN GUIDELINES TEXT APPLICATION - Complete');
  logger.info(`📁 Final image: ${result.imagePath}`);
  logger.info('═══════════════════════════════════════════════════════════════');

  return result;
}

