/**
 * Text Compositor (LEGACY - NOT CURRENTLY USED)
 * Renders text elements onto a base image according to layout JSON
 * 
 * This service takes:
 * - Base image (from Nano Banana)
 * - Layout JSON (from Gemini)
 * And produces the final composed image
 * 
 * NOTE: This file is legacy and not currently used. See textCompositorPro.ts for the current implementation.
 */

// @ts-nocheck - Legacy file with type compatibility issues, not currently used
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as logger from '../utils/logger';

// Legacy interfaces for backward compatibility with old code
interface TextLayoutComposition {
  canvas?: {
    width: number;
    height: number;
  };
  elements: TextElement[];
}

interface TextElement {
  content: string;
  position: {
    x: number;
    y: number;
  };
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  align?: string;
  textTransform?: string;
  letterSpacing?: number;
  lineHeight?: number;
  maxWidth?: number;
  background?: {
    color: string;
    paddingX: number;
    paddingY: number;
  };
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  zIndex?: number;
}

export interface CompositorInput {
  /** Path to base image or base64 data */
  baseImagePath?: string;
  baseImageBase64?: string;
  /** Layout composition JSON */
  layout: TextLayoutComposition;
  /** Output quality (1-100) */
  quality?: number;
  /** Output format */
  format?: 'png' | 'jpeg' | 'webp';
}

export interface CompositorOutput {
  /** Path to final composed image */
  imagePath: string;
  /** Base64 of final image */
  imageBase64: string;
  /** Final dimensions */
  width: number;
  height: number;
  /** Composition metadata */
  metadata: {
    timestamp: number;
    elementsRendered: number;
    format: string;
  };
}

function getOutputDir(): string {
  const outputDir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

/**
 * Convert hex color to RGBA
 */
function hexToRgba(hex: string, alpha: number = 1): { r: number; g: number; b: number; alpha: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 255, g: 255, b: 255, alpha };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    alpha,
  };
}

/**
 * Generate SVG text element
 * Note: Sharp uses librsvg for SVG rendering which has limited font support
 * We use web-safe fonts and inline styles for maximum compatibility
 */
function generateTextSvg(element: TextElement, canvasWidth: number, canvasHeight: number): string {
  // Calculate actual pixel positions from percentages
  const x = Math.round((element.position.x / 100) * canvasWidth);
  const y = Math.round((element.position.y / 100) * canvasHeight);
  const maxWidthPx = element.maxWidth ? Math.round((element.maxWidth / 100) * canvasWidth) : canvasWidth * 0.9;

  // Map font families to web-safe alternatives for SVG
  const fontFamilyMap: Record<string, string> = {
    'Montserrat': 'Arial, Helvetica, sans-serif',
    'Poppins': 'Arial, Helvetica, sans-serif',
    'Roboto': 'Arial, Helvetica, sans-serif',
    'Playfair Display': 'Georgia, Times New Roman, serif',
    'Open Sans': 'Arial, Helvetica, sans-serif',
  };
  const fontFamily = fontFamilyMap[element.fontFamily] || 'Arial, sans-serif';

  // Text anchor based on alignment
  const textAnchor = element.align === 'center' ? 'middle' : element.align === 'right' ? 'end' : 'start';

  // Adjust x position based on alignment
  let adjustedX = x;
  if (element.align === 'center') {
    adjustedX = canvasWidth / 2;
  } else if (element.align === 'right') {
    adjustedX = canvasWidth - (canvasWidth * 0.05); // 5% margin from right
  } else {
    adjustedX = canvasWidth * 0.05; // 5% margin from left
  }

  // Build text styles
  const styles: string[] = [
    `font-family: ${fontFamily}`,
    `font-size: ${element.fontSize}px`,
    `font-weight: ${element.fontWeight}`,
    `fill: ${element.color}`,
    `text-anchor: ${textAnchor}`,
  ];

  if (element.letterSpacing) {
    styles.push(`letter-spacing: ${element.letterSpacing}px`);
  }

  // Text transform
  let content = element.content;
  if (element.textTransform === 'uppercase') {
    content = content.toUpperCase();
  } else if (element.textTransform === 'lowercase') {
    content = content.toLowerCase();
  } else if (element.textTransform === 'capitalize') {
    content = content.replace(/\b\w/g, (char: any) => char.toUpperCase());
  }

  // Build SVG elements
  let svgParts: string[] = [];

  // Add background rectangle if specified
  if (element.background) {
    const bgColor = element.background.color;
    const padding = element.background.padding;
    const borderRadius = element.background.borderRadius;
    
    // Estimate text width (rough approximation)
    const estimatedWidth = content.length * element.fontSize * 0.6;
    const bgWidth = Math.min(estimatedWidth + padding * 2, maxWidthPx);
    const bgHeight = element.fontSize * element.lineHeight + padding * 2;
    
    const bgX = element.align === 'center' 
      ? adjustedX - bgWidth / 2 
      : element.align === 'right' 
        ? adjustedX - bgWidth 
        : adjustedX - padding;

    svgParts.push(`
      <rect 
        x="${bgX}" 
        y="${y - element.fontSize - padding}" 
        width="${bgWidth}" 
        height="${bgHeight}" 
        rx="${borderRadius}" 
        ry="${borderRadius}" 
        fill="${bgColor}"
      />
    `);
  }

  // Add shadow filter if specified
  let filterAttr = '';
  if (element.shadow) {
    const filterId = `shadow-${element.zIndex}`;
    const shadowColor = hexToRgba(element.shadow.color, 0.5);
    
    svgParts.push(`
      <defs>
        <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow 
            dx="${element.shadow.offsetX}" 
            dy="${element.shadow.offsetY}" 
            stdDeviation="${element.shadow.blur / 2}"
            flood-color="${element.shadow.color}"
            flood-opacity="0.5"
          />
        </filter>
      </defs>
    `);
    filterAttr = `filter="url(#${filterId})"`;
  }

  // Word wrap for long text
  const words = content.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  const charsPerLine = Math.floor(maxWidthPx / (element.fontSize * 0.5));

  for (const word of words) {
    if ((currentLine + ' ' + word).length <= charsPerLine) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Generate tspan elements for each line
  const lineHeight = element.fontSize * element.lineHeight;
  const tspans = lines.map((line, index) => 
    `<tspan x="${adjustedX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');

  svgParts.push(`
    <text 
      x="${adjustedX}" 
      y="${y}" 
      style="${styles.join('; ')}"
      ${filterAttr}
    >${tspans}</text>
  `);

  return svgParts.join('\n');
}

/**
 * Escape special XML characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Compose text elements onto base image
 */
export async function composeImageWithText(input: CompositorInput): Promise<CompositorOutput> {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('🎨 TEXT COMPOSITOR - Rendering Text on Image');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`📊 Elements to render: ${input.layout.elements.length}`);

  // Load base image
  let baseImage: sharp.Sharp;
  
  if (input.baseImagePath && fs.existsSync(input.baseImagePath)) {
    baseImage = sharp(input.baseImagePath);
    logger.info(`📷 Loading base image from: ${input.baseImagePath}`);
  } else if (input.baseImageBase64) {
    const buffer = Buffer.from(input.baseImageBase64, 'base64');
    baseImage = sharp(buffer);
    logger.info(`📷 Loading base image from base64 (${buffer.length} bytes)`);
  } else {
    throw new Error('No base image provided');
  }

  // Get image metadata
  const metadata = await baseImage.metadata();
  const width = metadata.width || input.layout.canvas.width;
  const height = metadata.height || input.layout.canvas.height;

  logger.info(`📐 Canvas size: ${width}x${height}`);

  // Sort elements by zIndex
  const sortedElements = [...input.layout.elements].sort((a, b) => a.zIndex - b.zIndex);

  // Generate SVG overlay with all text elements
  const svgElements = sortedElements.map((element) => 
    generateTextSvg(element, width, height)
  ).join('\n');

  const svgOverlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgElements}
    </svg>
  `;

  logger.info(`📝 Generated SVG overlay (${svgOverlay.length} chars)`);

  // Composite SVG onto base image
  const svgBuffer = Buffer.from(svgOverlay);

  try {
    const composited = baseImage.composite([
      {
        input: svgBuffer,
        top: 0,
        left: 0,
      },
    ]);

    // Determine output format
    const format = input.format || 'png';
    const quality = input.quality || 92;

    // Generate output
    let outputBuffer: Buffer;
    if (format === 'jpeg') {
      outputBuffer = await composited.jpeg({ quality }).toBuffer();
    } else if (format === 'webp') {
      outputBuffer = await composited.webp({ quality }).toBuffer();
    } else {
      outputBuffer = await composited.png({ quality }).toBuffer();
    }

    // Save to file
    const outputDir = getOutputDir();
    const timestamp = Date.now();
    const filename = `${timestamp}_composed_final.${format}`;
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, outputBuffer);

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('✅ TEXT COMPOSITOR - Composition Complete');
    logger.info(`📁 Output: ${outputPath}`);
    logger.info(`📐 Size: ${width}x${height}`);
    logger.info(`📊 Elements rendered: ${sortedElements.length}`);
    logger.info('═══════════════════════════════════════════════════════════════');

    return {
      imagePath: outputPath,
      imageBase64: outputBuffer.toString('base64'),
      width,
      height,
      metadata: {
        timestamp,
        elementsRendered: sortedElements.length,
        format,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('═══════════════════════════════════════════════════════════════');
    logger.error('❌ TEXT COMPOSITOR - Failed');
    logger.error(`Error: ${errorMsg}`);
    logger.error('═══════════════════════════════════════════════════════════════');
    throw new Error(`Text composition failed: ${errorMsg}`);
  }
}

/**
 * Simple test composition with hardcoded text
 * Useful for debugging the compositor without Gemini
 */
export async function testComposition(baseImagePath: string): Promise<CompositorOutput> {
  const testLayout: TextLayoutComposition = {
    canvas: { width: 1080, height: 1080, aspectRatio: '1:1' },
    elements: [
      {
        type: 'headline',
        content: 'OFERTA ESPECIAL',
        fontFamily: 'Montserrat',
        fontWeight: 800,
        fontSize: 72,
        color: '#FFFFFF',
        shadow: { color: '#000000', offsetX: 3, offsetY: 3, blur: 10 },
        align: 'center',
        verticalAnchor: 'top',
        position: { x: 50, y: 25 },
        maxWidth: 90,
        lineHeight: 1.1,
        letterSpacing: 2,
        textTransform: 'uppercase',
        zIndex: 10,
      },
      {
        type: 'subheadline',
        content: 'Hasta 50% de descuento',
        fontFamily: 'Montserrat',
        fontWeight: 500,
        fontSize: 36,
        color: '#FFDD00',
        shadow: { color: '#000000', offsetX: 1, offsetY: 1, blur: 4 },
        align: 'center',
        verticalAnchor: 'center',
        position: { x: 50, y: 40 },
        maxWidth: 80,
        lineHeight: 1.3,
        letterSpacing: 0,
        zIndex: 9,
      },
      {
        type: 'cta',
        content: 'COMPRAR AHORA',
        fontFamily: 'Montserrat',
        fontWeight: 700,
        fontSize: 28,
        color: '#FFFFFF',
        background: { color: '#FF4444', padding: 20, borderRadius: 10 },
        align: 'center',
        verticalAnchor: 'bottom',
        position: { x: 50, y: 85 },
        maxWidth: 60,
        lineHeight: 1.0,
        letterSpacing: 1,
        textTransform: 'uppercase',
        zIndex: 11,
      },
    ],
    globalStyle: {
      primaryColor: '#FFFFFF',
      accentColor: '#FF4444',
      theme: 'dark',
    },
    metadata: {
      model: 'test',
      timestamp: Date.now(),
      language: 'es',
    },
  };

  return composeImageWithText({
    baseImagePath,
    layout: testLayout,
    format: 'png',
    quality: 95,
  });
}

