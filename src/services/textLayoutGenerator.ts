/**
 * Text Layout Generator - Professional Edition
 * Uses Gemini to analyze reference images and generate matching layout instructions
 */

import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { GoogleGenAI } from '@google/genai';
import type { TextElement, CompositionLayout } from './textCompositorPro';

const TEXT_LAYOUT_MODEL = 'gemini-2.0-flash';

export interface LayoutInput {
  /** Text content from user */
  textContent: {
    headline?: string;
    subheadline?: string;
    cta?: string;
  };
  /** Text format preferences */
  textFormat?: {
    headlineSize?: 'small' | 'medium' | 'large' | 'xlarge';
    subheadlineSize?: 'small' | 'medium' | 'large';
    layout?: 'stacked' | 'side-by-side' | 'centered';
  };
  /** Style/aesthetic selected */
  style: string;
  /** Use case (promo, product, etc) */
  useCase: string;
  /** Image dimensions */
  imageWidth: number;
  imageHeight: number;
  /** Base64 of generated image for analysis */
  imageBase64?: string;
  /** Base64 of reference image to copy text style from */
  referenceImageBase64?: string;
  /** Detected theme from image analysis */
  imageTheme?: 'light' | 'dark';
  /** Language */
  language?: 'es' | 'en';
}

function requireApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return apiKey;
}

/**
 * Deep typography analysis result
 */
interface DeepTypographyAnalysis {
  found: boolean;
  position: {
    vertical: 'top' | 'middle' | 'bottom';
    horizontal: 'left' | 'center' | 'right';
    yPercent: number;
    xPercent: number;
  };
  headline: {
    fontCategory: 'serif' | 'sans-serif' | 'display' | 'script' | 'monospace';
    fontCharacter: 'elegant' | 'modern' | 'classic' | 'bold' | 'minimal' | 'luxury';
    weight: 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'black';
    style: 'normal' | 'italic' | 'condensed';
    size: 'small' | 'medium' | 'large' | 'xlarge';
    transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
    letterSpacing: 'tight' | 'normal' | 'wide' | 'very-wide';
    color: string; // hex or description
  };
  subheadline?: {
    fontCategory: 'serif' | 'sans-serif' | 'display' | 'script' | 'monospace';
    weight: 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold';
    size: 'small' | 'medium' | 'large';
    transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
    letterSpacing: 'tight' | 'normal' | 'wide';
    color: string;
  };
  visualStyle: {
    hasShadow: boolean;
    shadowIntensity: 'subtle' | 'medium' | 'strong';
    hasOutline: boolean;
    hasBackground: boolean;
    contrast: 'low' | 'medium' | 'high';
  };
  overallMood: string;
  suggestedFonts: string[];
}

/**
 * Map detected font characteristics to available system fonts
 */
function mapToSystemFont(analysis: DeepTypographyAnalysis['headline']): {
  fontFamily: string;
  fontWeight: string;
  letterSpacing: number;
} {
  const { fontCategory, fontCharacter, weight, letterSpacing: ls } = analysis;
  
  // Map weight to CSS weight
  const weightMap: Record<string, string> = {
    'thin': '100',
    'light': '300',
    'regular': '400',
    'medium': '500',
    'semibold': '600',
    'bold': '700',
    'black': '900',
  };
  
  // Map letter spacing
  const spacingMap: Record<string, number> = {
    'tight': 0,
    'normal': 1,
    'wide': 3,
    'very-wide': 5,
  };
  
  // Choose font based on category and character
  let fontFamily = 'Arial';
  
  if (fontCategory === 'serif') {
    if (fontCharacter === 'elegant' || fontCharacter === 'luxury') {
      fontFamily = 'Georgia';
    } else if (fontCharacter === 'classic') {
      fontFamily = 'Times New Roman';
    } else {
      fontFamily = 'Georgia';
    }
  } else if (fontCategory === 'sans-serif') {
    if (fontCharacter === 'elegant' || fontCharacter === 'luxury' || fontCharacter === 'minimal') {
      fontFamily = 'Helvetica';
    } else if (fontCharacter === 'modern') {
      fontFamily = 'Arial';
    } else if (fontCharacter === 'bold') {
      fontFamily = 'Arial';
    } else {
      fontFamily = 'Arial';
    }
  } else if (fontCategory === 'display') {
    fontFamily = 'Impact';
  } else {
    fontFamily = 'Arial';
  }
  
  return {
    fontFamily,
    fontWeight: weightMap[weight] || '700',
    letterSpacing: spacingMap[ls] || 2,
  };
}

/**
 * DEEP analysis of reference image typography
 * Takes longer but produces high-quality results
 */
async function analyzeReferenceTextStyle(referenceBase64: string): Promise<DeepTypographyAnalysis | null> {
  const apiKey = requireApiKey();
  
  logger.info('🔬 Starting DEEP typography analysis of reference image...');
  const startTime = Date.now();
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `You are an expert typographer and graphic designer. Analyze this image's TEXT OVERLAY in extreme detail.

IMPORTANT: Take your time. Quality matters more than speed.

ANALYZE THESE ASPECTS:

1. TEXT POSITION
   - Vertical: top (0-25%), middle (25-75%), bottom (75-100%)
   - Horizontal: left, center, right
   - Exact percentage from top where text starts

2. HEADLINE TYPOGRAPHY (main/largest text)
   - Font Category: serif, sans-serif, display, script, monospace
   - Font Character: elegant, modern, classic, bold, minimal, luxury
   - Weight: thin, light, regular, medium, semibold, bold, black
   - Style: normal, italic, condensed
   - Size relative to image: small, medium, large, xlarge
   - Text Transform: uppercase, lowercase, capitalize, none
   - Letter Spacing: tight (touching), normal, wide, very-wide (spaced out)
   - Color: describe or give hex

3. SUBHEADLINE (if exists - secondary smaller text)
   - Same analysis as headline

4. VISUAL EFFECTS
   - Has shadow? How strong?
   - Has outline/stroke?
   - Has background box?
   - Contrast level against image

5. OVERALL MOOD
   - Describe the typography vibe in 2-3 words

6. FONT SUGGESTIONS
   - What real fonts would match this style?

RESPOND WITH JSON ONLY (no markdown):
{
  "found": true,
  "position": {
    "vertical": "top",
    "horizontal": "center",
    "yPercent": 8,
    "xPercent": 50
  },
  "headline": {
    "fontCategory": "sans-serif",
    "fontCharacter": "luxury",
    "weight": "bold",
    "style": "normal",
    "size": "large",
    "transform": "uppercase",
    "letterSpacing": "wide",
    "color": "#FFFFFF"
  },
  "subheadline": {
    "fontCategory": "sans-serif",
    "weight": "medium",
    "size": "medium",
    "transform": "uppercase",
    "letterSpacing": "normal",
    "color": "#FFFFFF"
  },
  "visualStyle": {
    "hasShadow": true,
    "shadowIntensity": "strong",
    "hasOutline": false,
    "hasBackground": false,
    "contrast": "high"
  },
  "overallMood": "luxury minimal",
  "suggestedFonts": ["Helvetica Neue", "Futura", "Gotham"]
}

If NO TEXT is found in the image, return: {"found": false}`;

    const response = await ai.models.generateContent({
      model: TEXT_LAYOUT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: referenceBase64 } }
          ]
        }
      ],
      config: { temperature: 0.2, maxOutputTokens: 1500 },  // More tokens for detailed analysis
    });

    const duration = Date.now() - startTime;
    const rawText = response.text || '';
    
    logger.info(`✅ Deep analysis completed in ${duration}ms`);
    logger.info('📋 Raw analysis:', rawText.slice(0, 500));
    
    // Parse JSON
    let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleaned = cleaned.slice(start, end + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    if (!parsed.found) {
      logger.info('📝 No text found in reference image - will use style defaults');
      return null;
    }
    
    // Build the deep analysis result
    const result: DeepTypographyAnalysis = {
      found: true,
      position: {
        vertical: parsed.position?.vertical || 'top',
        horizontal: parsed.position?.horizontal || 'center',
        yPercent: parsed.position?.yPercent || 10,
        xPercent: parsed.position?.xPercent || 50,
      },
      headline: {
        fontCategory: parsed.headline?.fontCategory || 'sans-serif',
        fontCharacter: parsed.headline?.fontCharacter || 'modern',
        weight: parsed.headline?.weight || 'bold',
        style: parsed.headline?.style || 'normal',
        size: parsed.headline?.size || 'large',
        transform: parsed.headline?.transform || 'uppercase',
        letterSpacing: parsed.headline?.letterSpacing || 'wide',
        color: parsed.headline?.color || '#FFFFFF',
      },
      subheadline: parsed.subheadline ? {
        fontCategory: parsed.subheadline.fontCategory || 'sans-serif',
        weight: parsed.subheadline.weight || 'medium',
        size: parsed.subheadline.size || 'medium',
        transform: parsed.subheadline.transform || 'uppercase',
        letterSpacing: parsed.subheadline.letterSpacing || 'normal',
        color: parsed.subheadline.color || '#FFFFFF',
      } : undefined,
      visualStyle: {
        hasShadow: parsed.visualStyle?.hasShadow ?? true,
        shadowIntensity: parsed.visualStyle?.shadowIntensity || 'strong',
        hasOutline: parsed.visualStyle?.hasOutline || false,
        hasBackground: parsed.visualStyle?.hasBackground || false,
        contrast: parsed.visualStyle?.contrast || 'high',
      },
      overallMood: parsed.overallMood || 'professional',
      suggestedFonts: parsed.suggestedFonts || [],
    };
    
    // Log detailed analysis
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('🎨 DEEP TYPOGRAPHY ANALYSIS RESULTS:');
    logger.info(`   📍 Position: ${result.position.vertical} (y: ${result.position.yPercent}%)`);
    logger.info(`   🔤 Headline: ${result.headline.fontCategory} / ${result.headline.fontCharacter}`);
    logger.info(`   ⚖️  Weight: ${result.headline.weight}, Spacing: ${result.headline.letterSpacing}`);
    logger.info(`   🔠 Transform: ${result.headline.transform}`);
    logger.info(`   🎭 Mood: ${result.overallMood}`);
    logger.info(`   💡 Suggested fonts: ${result.suggestedFonts.join(', ')}`);
    logger.info('═══════════════════════════════════════════════════════════════');
    
    return result;
  } catch (e) {
    logger.warn('⚠️ Deep typography analysis failed:', e);
    return null;
  }
}

/**
 * Build prompt using DEEP reference style analysis
 */
function buildLayoutPromptWithReference(
  input: LayoutInput, 
  refStyle: DeepTypographyAnalysis | null
): string {
  const { textContent, style, imageWidth, imageHeight } = input;
  
  // Map the deep analysis to actual font settings
  let fontFamily = 'Arial';
  let fontWeight = '700';
  let letterSpacing = 2;
  let yPosition = 8;
  let textColor = '#FFFFFF';
  let fontSize = 72;
  let subFontSize = 36;
  let textTransform: 'uppercase' | 'none' = 'uppercase';
  let shadowIntensity = 'strong';
  
  if (refStyle) {
    // Map headline font
    const headlineFont = mapToSystemFont(refStyle.headline);
    fontFamily = headlineFont.fontFamily;
    fontWeight = headlineFont.fontWeight;
    letterSpacing = headlineFont.letterSpacing;
    
    // Position
    yPosition = refStyle.position.yPercent;
    
    // Color
    textColor = refStyle.headline.color.startsWith('#') ? refStyle.headline.color : '#FFFFFF';
    
    // Size
    const sizeMap: Record<string, number> = { small: 48, medium: 60, large: 72, xlarge: 84 };
    fontSize = sizeMap[refStyle.headline.size] || 72;
    
    // Subheadline size
    if (refStyle.subheadline) {
      const subSizeMap: Record<string, number> = { small: 24, medium: 32, large: 40 };
      subFontSize = subSizeMap[refStyle.subheadline.size] || 32;
    }
    
    // Transform
    textTransform = refStyle.headline.transform === 'uppercase' ? 'uppercase' : 'none';
    
    // Shadow
    shadowIntensity = refStyle.visualStyle.shadowIntensity;
  }
  
  // Shadow blur based on intensity
  const shadowBlurMap: Record<string, number> = { subtle: 10, medium: 18, strong: 28 };
  const shadowBlur = shadowBlurMap[shadowIntensity] || 25;
  
  // Ensure y position is in allowed zone (not center)
  let safeY = yPosition;
  if (safeY > 20 && safeY < 80) {
    safeY = 8; // Move to top if in forbidden zone
  }
  
  return `You are an expert graphic designer. Generate text layout JSON that COPIES the reference typography style.

IMAGE: ${imageWidth}x${imageHeight}px
STYLE: ${style}

═══════════════════════════════════════════════════
TYPOGRAPHY STYLE FROM REFERENCE (COPY THIS EXACTLY):
═══════════════════════════════════════════════════
• Font Family: ${fontFamily}
• Font Weight: ${fontWeight}
• Letter Spacing: ${letterSpacing}px
• Text Transform: ${textTransform}
• Color: ${textColor}
• Shadow: blur ${shadowBlur}px (${shadowIntensity})
${refStyle ? `• Overall Mood: ${refStyle.overallMood}` : ''}
${refStyle?.suggestedFonts?.length ? `• Similar fonts: ${refStyle.suggestedFonts.join(', ')}` : ''}

TEXT TO PLACE:
${textContent.headline ? `• HEADLINE: "${textContent.headline}" → ${fontSize}px` : ''}
${textContent.subheadline ? `• SUBHEADLINE: "${textContent.subheadline}" → ${subFontSize}px` : ''}

POSITIONING RULES (CRITICAL - SPLIT TOP/BOTTOM):
- Headline: y = 4% (TOP of image)
- Subheadline: y = 88% (BOTTOM of image) ← IMPORTANT: Put subheadline at BOTTOM, not near headline!
- x = 50, anchor = "center" (ALWAYS CENTERED)
- NEVER place text at y: 15-80% (forbidden zone - person/product area)
- This creates VISUAL BALANCE: text at top AND bottom, person in middle

Return ONLY valid JSON (no markdown):
{
  "elements": [
    ${textContent.headline ? `{
      "text": "${textContent.headline}",
      "type": "headline",
      "position": { "x": 50, "y": ${Math.min(safeY, 4)}, "anchor": "center" },
      "style": {
        "fontFamily": "${fontFamily}",
        "fontSize": ${fontSize},
        "fontWeight": "${fontWeight}",
        "color": "${textColor}",
        "letterSpacing": ${letterSpacing},
        "lineHeight": 1.1,
        "textTransform": "${textTransform}",
        "maxWidth": 80,
        "shadow": { "color": "rgba(0,0,0,0.95)", "blur": ${shadowBlur}, "offsetX": 0, "offsetY": 4 }
      }
    }` : ''}${textContent.headline && textContent.subheadline ? ',' : ''}
    ${textContent.subheadline ? `{
      "text": "${textContent.subheadline}",
      "type": "subheadline",
      "position": { "x": 50, "y": 88, "anchor": "center" },
      "style": {
        "fontFamily": "${fontFamily}",
        "fontSize": ${subFontSize},
        "fontWeight": "${refStyle?.subheadline ? mapToSystemFont(refStyle.subheadline as any).fontWeight : '600'}",
        "color": "${textColor}",
        "letterSpacing": ${Math.max(letterSpacing - 1, 1)},
        "lineHeight": 1.2,
        "textTransform": "${textTransform}",
        "maxWidth": 75,
        "shadow": { "color": "rgba(0,0,0,0.9)", "blur": ${Math.max(shadowBlur - 5, 15)}, "offsetX": 0, "offsetY": 3 }
      }
    }` : ''}
  ],
  "theme": "dark"
}`;
}

/**
 * Build prompt for Gemini to generate precise layout (fallback without reference)
 */
function buildLayoutPrompt(input: LayoutInput): string {
  const { textContent, textFormat, style, useCase, imageWidth, imageHeight, imageTheme } = input;
  
  // Determine font sizes based on user preference
  const headlineSizes: Record<string, number> = { small: 48, medium: 64, large: 80, xlarge: 96 };
  const subheadlineSizes: Record<string, number> = { small: 20, medium: 28, large: 36 };
  const headlineSize = textFormat?.headlineSize ? headlineSizes[textFormat.headlineSize] : 64;
  const subheadlineSize = textFormat?.subheadlineSize ? subheadlineSizes[textFormat.subheadlineSize] : 28;
  
  return `You are an expert graphic designer. Generate a professional text layout for an advertising image.

IMAGE INFO:
- Dimensions: ${imageWidth}x${imageHeight}
- Aspect ratio: ${imageWidth > imageHeight ? 'landscape' : imageHeight > imageWidth ? 'portrait/story' : 'square'}
- Background theme: ${imageTheme || 'assume dark/busy background'}

STYLE: ${style}
USE CASE: ${useCase}

TEXT TO PLACE (ONLY THESE, DO NOT ADD ANYTHING ELSE):
${textContent.headline ? `- HEADLINE: "${textContent.headline}" (size: ${headlineSize}px)` : '- NO HEADLINE'}
${textContent.subheadline ? `- SUBHEADLINE: "${textContent.subheadline}" (size: ${subheadlineSize}px)` : '- NO SUBHEADLINE'}
${textContent.cta ? `- CTA BUTTON: "${textContent.cta}"` : '- NO CTA BUTTON'}

⚠️ CRITICAL RULES:
1. Only include the text elements listed above. DO NOT invent or add any text that wasn't provided.
2. If it says "NO CTA BUTTON", do NOT add any button.
3. **NEVER place text over people's faces or important subjects** - analyze where the main subject is and AVOID that area.
4. For portrait/story images: prefer placing text at TOP or BOTTOM, leaving the middle for the subject.
5. For promotional text with two parts (like "50% OFF + ENVIO GRATIS"), split them: main offer LARGER on top, secondary text SMALLER below.

TEXT POSITIONING RULES - CRITICAL:
⚠️ THERE IS ALWAYS A PERSON/PRODUCT IN THE CENTER - NEVER COVER THEM ⚠️

ALLOWED ZONES ONLY:
┌─────────────────────────┐
│  TOP ZONE (y: 3-20%)    │  ← Headline here (y: 5-8%)
│                         │  ← Subheadline here (y: 12-18%) 
├─────────────────────────┤
│                         │
│  🚫 FORBIDDEN ZONE 🚫   │  ← y: 20-82% = NEVER PUT TEXT HERE
│  (y: 20% - 82%)         │
│                         │
├─────────────────────────┤
│  BOTTOM ZONE (y: 82-95%)│  ← CTA here (y: 90-94%)
└─────────────────────────┘

LAYOUT OPTIONS:
A) Both texts at TOP: Headline y:5%, Subheadline y:13%
B) Split TOP/BOTTOM: Headline y:5% (top), Subheadline y:88% (bottom)

- Headlines should be 2.5-3x larger than subheadlines
- For portrait/story (9:16): use option A (both at TOP)

DESIGN REQUIREMENTS:
1. Text must be HIGHLY LEGIBLE over the image
2. Use appropriate contrast (white text with shadow for dark images, dark text for light images)
3. Professional typography hierarchy - clear size difference between headline and subheadline
4. Position text in SAFE AREAS that won't cover the main subject (person, product)
5. CTA should look like a button (with background) at the BOTTOM

Return ONLY valid JSON matching this exact structure:
{
  "elements": [
    {
      "text": "string - the actual text",
      "type": "headline | subheadline | cta",
      "position": {
        "x": number (0-100, percentage from left),
        "y": number (0-100, percentage from top),
        "anchor": "left | center | right"
      },
      "style": {
        "fontFamily": "Arial | Georgia | Helvetica",
        "fontSize": number (pixels, for 1080px canvas: headline 60-80, subheadline 28-36, cta 22-28),
        "fontWeight": "400 | 500 | 600 | 700 | 800 | 900",
        "color": "hex color string",
        "letterSpacing": number (0-4),
        "lineHeight": number (1.0-1.5),
        "textTransform": "uppercase | lowercase | capitalize | none",
        "maxWidth": number (percentage 60-90),
        "shadow": {
          "color": "rgba string",
          "blur": number (8-16),
          "offsetX": number (0-2),
          "offsetY": number (2-6)
        },
        "background": null OR {
          "color": "hex color for CTA button",
          "paddingX": number (24-40),
          "paddingY": number (12-20),
          "borderRadius": number (4-8)
        }
      }
    }
  ],
  "theme": "light | dark"
}

STYLE GUIDE FOR "${style}":
${getStyleGuide(style)}

Generate the JSON now:`;
}

/**
 * PROFESSIONAL DESIGN RULES - These are NON-NEGOTIABLE
 * The AI must follow these to produce quality output
 */
const DESIGN_RULES = `
═══════════════════════════════════════════════════════════════
🎨 PROFESSIONAL DESIGN RULES (MANDATORY)
═══════════════════════════════════════════════════════════════

❌ NEVER DO:
- NEVER use italic fonts - looks amateur and hard to read
- NEVER use thin/light font weights (100-300) - not readable on photos
- NEVER use colored text (yellow, gold, etc) - loses contrast on busy backgrounds
- NEVER make subheadline smaller than 32px - becomes unreadable
- NEVER use tight letter spacing on headlines - looks cramped
- NEVER skip shadows - text becomes invisible on light backgrounds

✅ ALWAYS DO:
- ALWAYS use white (#FFFFFF) for text - maximum contrast on any background
- ALWAYS use bold/heavy weights (600-900) - readable and impactful
- ALWAYS use UPPERCASE for promotional text - more impactful
- ALWAYS add strong shadow (blur 20-30px, rgba(0,0,0,0.9)) - ensures legibility
- ALWAYS make headline BIG (70-90px) - it's the hero text
- ALWAYS make subheadline visible (36-44px minimum) - must be readable
- ALWAYS use wide letter spacing (2-4px) on headlines - luxury look

📐 SIZE HIERARCHY:
- Headline: 75-90px (DOMINANT)
- Subheadline: 38-48px (clearly secondary but READABLE)
- Ratio: headline should be ~2x the subheadline size

🎯 THE GOAL:
Text should look like a premium fashion brand ad - clean, bold, impactful, READABLE.
Think: Zara, H&M, Nike ads - not amateur Canva templates.
`;

function getStyleGuide(style: string): string {
  // ALL styles follow professional rules + style-specific adjustments
  const styleSpecific: Record<string, string> = {
    'Old Money': `
STYLE: Old Money / Luxury
- Font: Arial or Helvetica (clean, NOT serif which can look italic)
- Headline: fontWeight 700, fontSize 80px, letterSpacing 3, UPPERCASE
- Subheadline: fontWeight 600, fontSize 40px, letterSpacing 2, UPPERCASE
- Color: Pure white #FFFFFF (NEVER gold/yellow - loses contrast)
- Shadow: VERY STRONG - blur 30px
- Vibe: Ralph Lauren, Loro Piana - understated luxury, MAXIMUM readability`,
    
    'Minimalista': `
STYLE: Minimalist
- Font: Helvetica or Arial
- Headline: fontWeight 600, fontSize 76px, letterSpacing 4, UPPERCASE
- Subheadline: fontWeight 500, fontSize 38px, letterSpacing 2, UPPERCASE
- Color: White #FFFFFF
- Shadow: Strong but clean
- Vibe: Apple, Muji - clean but READABLE`,
    
    'Vibrante': `
STYLE: Vibrant / Bold
- Font: Arial Black or Arial
- Headline: fontWeight 900, fontSize 85px, letterSpacing 2, UPPERCASE
- Subheadline: fontWeight 700, fontSize 42px, letterSpacing 1, UPPERCASE
- Color: White #FFFFFF
- Shadow: Very strong
- Vibe: Nike, Adidas - bold impact`,
    
    'Elegante': `
STYLE: Elegant
- Font: Arial
- Headline: fontWeight 700, fontSize 78px, letterSpacing 3, UPPERCASE
- Subheadline: fontWeight 600, fontSize 40px, letterSpacing 2, UPPERCASE
- Color: White #FFFFFF
- Shadow: Strong
- Vibe: Chanel, Dior - refined but readable`,
    
    'Urbano': `
STYLE: Urban / Street
- Font: Arial
- Headline: fontWeight 900, fontSize 82px, letterSpacing 1, UPPERCASE
- Subheadline: fontWeight 700, fontSize 40px, letterSpacing 1, UPPERCASE
- Color: White #FFFFFF
- Shadow: Very strong
- Vibe: Supreme, Off-White - bold street style`,
  };
  
  return DESIGN_RULES + '\n' + (styleSpecific[style] || styleSpecific['Elegante']);
}

/**
 * VALIDATE AND FIX layout generated by Gemini
 * Forces correct positioning and styling
 */
function validateAndFixLayout(
  layout: CompositionLayout, 
  textContent: { headline?: string; subheadline?: string; cta?: string }
): CompositionLayout {
  const fixedElements: TextElement[] = [];
  
  // Process each element type to ensure correct positioning
  // MORE SPACE between headline and subheadline to prevent overlap
  let headlineY = 3;      // Headline at very top (3%)
  let subheadlineY = 18;  // Subheadline with more space (18%) - was 13%
  let ctaY = 92;
  
  for (const element of layout.elements) {
    const fixed = { ...element };
    
    // FORCE CENTER ALIGNMENT - always x=50, anchor=center
    fixed.position = {
      x: 50,
      y: fixed.position.y,
      anchor: 'center',
    };
    
    // FIX Y POSITION - must be in allowed zones
    if (fixed.type === 'headline') {
      // Headlines: TOP zone only (y: 3-15%)
      if (fixed.position.y < 3 || fixed.position.y > 20) {
        fixed.position.y = headlineY;
      }
      headlineY = fixed.position.y; // Track for subheadline positioning
    } else if (fixed.type === 'subheadline') {
      // SUBHEADLINE ALWAYS GOES TO BOTTOM when there's a headline
      // This creates visual balance: text top AND bottom
      if (headlineY < 20) {
        // There's a headline at top → put subheadline at BOTTOM
        fixed.position.y = 88;
      } else {
        // No headline at top → subheadline can go to top
        fixed.position.y = 4;
      }
    } else if (fixed.type === 'cta') {
      // CTA: BOTTOM zone only (y: 85-95%)
      if (fixed.position.y < 85) {
        fixed.position.y = ctaY;
      }
    }
    
    // ENSURE Y is in valid range
    if (fixed.position.y > 20 && fixed.position.y < 82 && fixed.type !== 'cta') {
      logger.warn(`⚠️ Text "${fixed.text.substring(0,20)}..." was in forbidden zone (y=${fixed.position.y}), moving to top`);
      fixed.position.y = fixed.type === 'headline' ? 5 : 13;
    }
    
    // FIX STYLE
    fixed.style = {
      ...fixed.style,
      // Limit maxWidth to prevent text cutoff
      maxWidth: Math.min(fixed.style.maxWidth || 85, 80),
      // Ensure good shadow
      shadow: fixed.style.shadow || { color: 'rgba(0,0,0,0.8)', blur: 15, offsetX: 0, offsetY: 3 },
    };
    
    // Ensure fontWeight is string
    if (typeof fixed.style.fontWeight === 'number') {
      fixed.style.fontWeight = String(fixed.style.fontWeight) as any;
    }
    
    fixedElements.push(fixed);
  }
  
  logger.info(`📐 Layout validated: ${fixedElements.length} elements, all centered`);
  
  return {
    elements: fixedElements,
    theme: layout.theme,
  };
}

/**
 * Parse Gemini response
 */
function parseLayoutResponse(raw: string): CompositionLayout {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    
    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      throw new Error('Invalid layout: missing elements array');
    }

    return {
      elements: parsed.elements as TextElement[],
      theme: parsed.theme || 'dark',
    };
  } catch (e) {
    throw new Error(`Failed to parse layout: ${e}`);
  }
}

/**
 * Generate professional text layout using Gemini
 * If reference image provided, analyze it to copy the text style
 */
export async function generateProfessionalLayout(input: LayoutInput): Promise<CompositionLayout> {
  const apiKey = requireApiKey();

  // If no text content, return empty layout
  if (!input.textContent.headline && !input.textContent.subheadline && !input.textContent.cta) {
    return { elements: [], theme: 'dark' };
  }

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('📐 LAYOUT GENERATOR - Creating Professional Layout');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`🎨 Style: ${input.style}`);
  logger.info(`📝 Headline: ${input.textContent.headline || '(none)'}`);
  logger.info(`📝 Subheadline: ${input.textContent.subheadline || '(none)'}`);
  logger.info(`📝 CTA: ${input.textContent.cta || '(none)'}`);
  logger.info(`🖼️ Has reference image: ${input.referenceImageBase64 ? 'YES' : 'NO'}`);

  // If we have a reference image, do DEEP analysis of typography
  let referenceStyle: DeepTypographyAnalysis | null = null;
  if (input.referenceImageBase64) {
    logger.info('🔬 Starting DEEP typography analysis...');
    referenceStyle = await analyzeReferenceTextStyle(input.referenceImageBase64);
    if (referenceStyle) {
      logger.info(`✅ Deep analysis complete: ${referenceStyle.overallMood}`);
      logger.info(`   Position: y=${referenceStyle.position.yPercent}%`);
      logger.info(`   Headline: ${referenceStyle.headline.fontCategory} / ${referenceStyle.headline.fontCharacter} / ${referenceStyle.headline.weight}`);
    }
  }

  const prompt = buildLayoutPromptWithReference(input, referenceStyle);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: TEXT_LAYOUT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, maxOutputTokens: 1500 },
    });

    const duration = Date.now() - startTime;
    const rawText = response.text || '';

    logger.info(`✅ Layout generated in ${duration}ms`);

    let layout = parseLayoutResponse(rawText);
    
    // VALIDATE AND FIX the layout - Gemini sometimes generates weird positions
    layout = validateAndFixLayout(layout, input.textContent);

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info(`✅ Layout ready: ${layout.elements.length} elements`);
    logger.info('═══════════════════════════════════════════════════════════════');

    return layout;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Layout generation failed: ${msg}`);
    
    // Return fallback layout
    return generateFallbackLayout(input.textContent, input.style);
  }
}

/**
 * Professional style presets for different aesthetics
 */
/**
 * PROFESSIONAL STYLE PRESETS
 * All use WHITE text, BOLD weights, LARGE sizes - guaranteed readable
 */
const STYLE_PRESETS: Record<string, {
  headline: { font: string; weight: string; letterSpacing: number; transform: 'uppercase' | 'none'; fontSize: number };
  subheadline: { font: string; weight: string; letterSpacing: number; transform: 'uppercase' | 'none'; fontSize: number };
  colors: { text: string; accent: string };
}> = {
  'old-money': {
    headline: { font: 'Arial', weight: '700', letterSpacing: 3, transform: 'uppercase', fontSize: 80 },
    subheadline: { font: 'Arial', weight: '600', letterSpacing: 2, transform: 'uppercase', fontSize: 40 },
    colors: { text: '#FFFFFF', accent: '#FFFFFF' },  // WHITE only - no gold
  },
  'elegante': {
    headline: { font: 'Arial', weight: '700', letterSpacing: 3, transform: 'uppercase', fontSize: 78 },
    subheadline: { font: 'Arial', weight: '600', letterSpacing: 2, transform: 'uppercase', fontSize: 40 },
    colors: { text: '#FFFFFF', accent: '#FFFFFF' },
  },
  'minimalista': {
    headline: { font: 'Helvetica', weight: '600', letterSpacing: 4, transform: 'uppercase', fontSize: 76 },
    subheadline: { font: 'Helvetica', weight: '500', letterSpacing: 2, transform: 'uppercase', fontSize: 38 },
    colors: { text: '#FFFFFF', accent: '#FFFFFF' },
  },
  'vibrante': {
    headline: { font: 'Arial', weight: '900', letterSpacing: 2, transform: 'uppercase', fontSize: 85 },
    subheadline: { font: 'Arial', weight: '700', letterSpacing: 1, transform: 'uppercase', fontSize: 42 },
    colors: { text: '#FFFFFF', accent: '#FFFFFF' },
  },
  'urbano': {
    headline: { font: 'Arial', weight: '900', letterSpacing: 1, transform: 'uppercase', fontSize: 82 },
    subheadline: { font: 'Arial', weight: '700', letterSpacing: 1, transform: 'uppercase', fontSize: 40 },
    colors: { text: '#FFFFFF', accent: '#FFFFFF' },
  },
  'default': {
    headline: { font: 'Arial', weight: '700', letterSpacing: 3, transform: 'uppercase', fontSize: 80 },
    subheadline: { font: 'Arial', weight: '600', letterSpacing: 2, transform: 'uppercase', fontSize: 40 },
    colors: { text: '#FFFFFF', accent: '#FFFFFF' },
  },
};

function getStylePreset(style: string): typeof STYLE_PRESETS['default'] {
  const normalized = style.toLowerCase().replace(/[\s-_]+/g, '-');
  return STYLE_PRESETS[normalized] || STYLE_PRESETS['default'];
}

/**
 * TEXT POSITIONING STRATEGY:
 * 
 * REGLA DE ORO: NUNCA poner texto en el centro (y: 25-75%) - ahí va la persona/producto
 * 
 * Layout cuando hay 2 textos:
 * - Headline ARRIBA (y: 3-5%)
 * - Subheadline ABAJO (y: 88-92%)
 * 
 * Esto da mejor balance visual y NUNCA se pisan los textos
 */
type TextLayout = 'both-top' | 'split-top-bottom';

function determineTextLayout(hasHeadline: boolean, hasSubheadline: boolean): TextLayout {
  // Si hay 2 textos → SEPARAR: uno arriba, otro abajo
  if (hasHeadline && hasSubheadline) {
    return 'split-top-bottom';
  }
  // Si solo hay uno → arriba
  return 'both-top';
}

/**
 * Fallback layout if Gemini fails
 * ONLY includes text that was explicitly provided - never adds extra elements
 * Uses professional style presets for high-quality output
 * 
 * POSITIONING: Top zone (y: 3-20%) or Bottom zone (y: 85-95%), NEVER center
 */
export function generateFallbackLayout(
  textContent: { headline?: string; subheadline?: string; cta?: string },
  style: string
): CompositionLayout {
  const elements: TextElement[] = [];
  const preset = getStylePreset(style);
  const hasHeadline = !!(textContent.headline && textContent.headline.trim());
  const hasSubheadline = !!(textContent.subheadline && textContent.subheadline.trim());
  const hasCta = !!(textContent.cta && textContent.cta.trim());
  
  const layout = determineTextLayout(hasHeadline, hasSubheadline);
  
  // Calculate positions based on layout strategy
  let headlineY = 4;      // Default: TOP (4%)
  let subheadlineY = 88;  // Default: BOTTOM (88%) - SPLIT layout
  let ctaY = 95;          // CTA always at very bottom
  
  // SPLIT LAYOUT: Headline TOP, Subheadline BOTTOM
  if (layout === 'split-top-bottom' && hasHeadline && hasSubheadline) {
    headlineY = 4;        // TOP
    subheadlineY = 88;    // BOTTOM - clear separation
  }
  
  // If only headline or only subheadline, put it at top
  if (hasHeadline && !hasSubheadline) {
    headlineY = 4;
  }
  if (!hasHeadline && hasSubheadline) {
    subheadlineY = 4;  // If only subheadline, treat it as headline position
  }
  
  // If there's a CTA, adjust bottom text
  if (hasCta) {
    if (layout === 'split-top-bottom') {
      subheadlineY = 85;  // Move subheadline up a bit
      ctaY = 93;
    } else {
      ctaY = 92;
    }
  }
  
  // HEADLINE - TOP - BIG, BOLD, WHITE, READABLE
  if (hasHeadline) {
    elements.push({
      text: textContent.headline!,
      type: 'headline',
      position: { x: 50, y: headlineY, anchor: 'center' },
      style: {
        fontFamily: preset.headline.font,
        fontSize: preset.headline.fontSize,  // From preset (80px for old-money)
        fontWeight: preset.headline.weight as any,
        color: '#FFFFFF',  // ALWAYS WHITE - maximum contrast
        textTransform: preset.headline.transform,
        letterSpacing: preset.headline.letterSpacing,
        lineHeight: 1.1,
        maxWidth: 90,
        // VERY STRONG shadow - readable on ANY background
        shadow: { color: 'rgba(0,0,0,0.95)', blur: 30, offsetX: 0, offsetY: 6 },
      },
    });
  }

  // SUBHEADLINE - BOTTOM - VISIBLE, CLEAR, READABLE
  if (hasSubheadline) {
    elements.push({
      text: textContent.subheadline!,
      type: 'subheadline',
      position: { x: 50, y: subheadlineY, anchor: 'center' },
      style: {
        fontFamily: preset.subheadline.font,
        fontSize: preset.subheadline.fontSize,  // From preset (40px for old-money)
        fontWeight: preset.subheadline.weight as any,
        color: '#FFFFFF',  // ALWAYS WHITE
        textTransform: preset.subheadline.transform,
        letterSpacing: preset.subheadline.letterSpacing,
        lineHeight: 1.2,
        maxWidth: 80,
        // STRONG shadow
        shadow: { color: 'rgba(0,0,0,0.95)', blur: 25, offsetX: 0, offsetY: 4 },
      },
    });
  }

  // CTA - ALWAYS at BOTTOM (y: 90-95%)
  if (hasCta) {
    elements.push({
      text: textContent.cta!,
      type: 'cta',
      position: { x: 50, y: ctaY, anchor: 'center' },
      style: {
        fontFamily: 'Helvetica',
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: 2,
        background: {
          color: '#1a1a1a',
          paddingX: 28,
          paddingY: 12,
          borderRadius: 4,
        },
      },
    });
  }

  return { elements, theme: 'dark' };
}
