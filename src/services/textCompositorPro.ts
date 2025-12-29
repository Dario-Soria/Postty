/**
 * Professional Text Compositor
 * Uses node-canvas for high-quality text rendering
 */

import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from 'canvas';
import * as logger from '../utils/logger';

// Registrar fuentes del sistema (si hay custom fonts)
const FONTS_DIR = path.join(process.cwd(), 'fonts');
if (fs.existsSync(FONTS_DIR)) {
  const fontFiles = fs.readdirSync(FONTS_DIR).filter(f => f.endsWith('.ttf') || f.endsWith('.otf'));
  fontFiles.forEach(font => {
    try {
      registerFont(path.join(FONTS_DIR, font), { family: font.replace(/\.(ttf|otf)$/, '') });
    } catch (e) {
      logger.warn(`Could not register font: ${font}`);
    }
  });
}

export interface TextElement {
  text: string;
  type: 'headline' | 'subheadline' | 'cta' | 'body';
  position: {
    x: number; // 0-100 percentage
    y: number; // 0-100 percentage
    anchor: 'left' | 'center' | 'right';
  };
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
    color: string;
    letterSpacing?: number;
    lineHeight?: number;
    textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
    shadow?: {
      color: string;
      blur: number;
      offsetX: number;
      offsetY: number;
    };
    background?: {
      color: string;
      paddingX: number;
      paddingY: number;
      borderRadius: number;
    };
    maxWidth?: number; // percentage
  };
}

export interface CompositionLayout {
  elements: TextElement[];
  theme: 'light' | 'dark' | 'auto';
}

export interface CompositorInput {
  baseImagePath?: string;
  baseImageBase64?: string;
  layout: CompositionLayout;
  outputFormat?: 'png' | 'jpeg';
  quality?: number;
}

export interface CompositorOutput {
  imagePath: string;
  imageBase64: string;
  width: number;
  height: number;
}

function getOutputDir(): string {
  const dir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Apply text transform
 */
function applyTextTransform(text: string, transform?: string): string {
  if (!transform || transform === 'none') return text;
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return text.replace(/\b\w/g, c => c.toUpperCase());
  return text;
}

/**
 * Wrap text to fit within maxWidth
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Draw a subtle gradient overlay behind text for better legibility
 */
function drawTextBackdrop(
  ctx: CanvasRenderingContext2D,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  textHeight: number
): void {
  // Create a subtle gradient from top
  const gradientHeight = textHeight + canvasHeight * 0.15;
  const gradient = ctx.createLinearGradient(0, 0, 0, gradientHeight);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
  gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, gradientHeight);
}

/**
 * Draw text with professional styling - multiple shadow layers for depth
 */
function drawStyledText(
  ctx: CanvasRenderingContext2D,
  element: TextElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { text, position, style } = element;
  
  // Calculate actual positions
  const x = (position.x / 100) * canvasWidth;
  const y = (position.y / 100) * canvasHeight;
  const maxWidth = style.maxWidth ? (style.maxWidth / 100) * canvasWidth : canvasWidth * 0.9;

  // Set font - use better font stack
  const fontWeight = style.fontWeight === 'bold' ? '700' : style.fontWeight || '400';
  const fontFamily = style.fontFamily || 'Arial';
  ctx.font = `${fontWeight} ${style.fontSize}px "${fontFamily}", "Helvetica Neue", Arial, sans-serif`;
  
  // Apply text transform
  const displayText = applyTextTransform(text, style.textTransform);
  
  // Wrap text if needed
  const lines = wrapText(ctx, displayText, maxWidth);
  const lineHeight = style.fontSize * (style.lineHeight || 1.15);
  
  // Calculate text alignment offset
  ctx.textAlign = position.anchor === 'center' ? 'center' : position.anchor === 'right' ? 'right' : 'left';
  ctx.textBaseline = 'top';

  // Calculate total height for background
  const totalHeight = lines.length * lineHeight;
  
  // Draw background if specified
  if (style.background) {
    const bg = style.background;
    let bgWidth = 0;
    
    // Find widest line
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      bgWidth = Math.max(bgWidth, metrics.width);
    }
    
    const bgX = position.anchor === 'center' 
      ? x - bgWidth / 2 - bg.paddingX
      : position.anchor === 'right'
        ? x - bgWidth - bg.paddingX
        : x - bg.paddingX;
    
    const bgY = y - bg.paddingY;
    
    ctx.fillStyle = bg.color;
    
    // Draw rounded rectangle
    const radius = bg.borderRadius;
    const rectWidth = bgWidth + bg.paddingX * 2;
    const rectHeight = totalHeight + bg.paddingY * 2;
    
    ctx.beginPath();
    ctx.moveTo(bgX + radius, bgY);
    ctx.lineTo(bgX + rectWidth - radius, bgY);
    ctx.quadraticCurveTo(bgX + rectWidth, bgY, bgX + rectWidth, bgY + radius);
    ctx.lineTo(bgX + rectWidth, bgY + rectHeight - radius);
    ctx.quadraticCurveTo(bgX + rectWidth, bgY + rectHeight, bgX + rectWidth - radius, bgY + rectHeight);
    ctx.lineTo(bgX + radius, bgY + rectHeight);
    ctx.quadraticCurveTo(bgX, bgY + rectHeight, bgX, bgY + rectHeight - radius);
    ctx.lineTo(bgX, bgY + radius);
    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
    ctx.closePath();
    ctx.fill();
  }

  // Helper to draw text with letter spacing
  const drawTextLine = (line: string, lineX: number, lineY: number) => {
    const letterSpacing = style.letterSpacing || 0;
    
    if (letterSpacing !== 0) {
      const chars = line.split('');
      let currentX = lineX;
      
      if (position.anchor === 'center') {
        const totalWidth = ctx.measureText(line).width + (chars.length - 1) * letterSpacing;
        currentX = lineX - totalWidth / 2;
      } else if (position.anchor === 'right') {
        const totalWidth = ctx.measureText(line).width + (chars.length - 1) * letterSpacing;
        currentX = lineX - totalWidth;
      }
      
      const savedAlign = ctx.textAlign;
      ctx.textAlign = 'left';
      chars.forEach(char => {
        ctx.fillText(char, currentX, lineY);
        currentX += ctx.measureText(char).width + letterSpacing;
      });
      ctx.textAlign = savedAlign;
    } else {
      ctx.fillText(line, lineX, lineY);
    }
  };

  // Draw each line with HEAVY multi-layer shadows for ANY background
  lines.forEach((line, index) => {
    const lineY = y + (index * lineHeight);
    
    // === LAYER 1: Wide black halo (ensures readability on ANY background) ===
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    drawTextLine(line, x, lineY);
    
    // === LAYER 2: Strong drop shadow ===
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    drawTextLine(line, x, lineY);
    
    // === LAYER 3: Medium glow ===
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    drawTextLine(line, x, lineY);
    
    // === LAYER 4: Tight crisp shadow ===
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    drawTextLine(line, x, lineY);
    
    // === LAYER 5: Custom or default final shadow ===
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = Math.max(style.shadow.blur, 15); // Minimum blur
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
    }
    
    // === FINAL LAYER: Actual text (crisp white) ===
    ctx.fillStyle = style.color;
    drawTextLine(line, x, lineY);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });
}

/**
 * Compose text onto base image using canvas
 */
export async function composeWithCanvas(input: CompositorInput): Promise<CompositorOutput> {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('🎨 PRO TEXT COMPOSITOR - Canvas Rendering');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`📊 Elements to render: ${input.layout.elements.length}`);

  // Load base image
  let baseImage;
  if (input.baseImagePath && fs.existsSync(input.baseImagePath)) {
    baseImage = await loadImage(input.baseImagePath);
    logger.info(`📷 Base image loaded from: ${input.baseImagePath}`);
  } else if (input.baseImageBase64) {
    const buffer = Buffer.from(input.baseImageBase64, 'base64');
    baseImage = await loadImage(buffer);
    logger.info(`📷 Base image loaded from base64`);
  } else {
    throw new Error('No base image provided');
  }

  const width = baseImage.width;
  const height = baseImage.height;
  
  logger.info(`📐 Canvas size: ${width}x${height}`);

  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw base image
  ctx.drawImage(baseImage, 0, 0);

  // Sort elements by type (backgrounds first, then text)
  const sortedElements = [...input.layout.elements].sort((a, b) => {
    const order = { cta: 3, headline: 2, subheadline: 1, body: 0 };
    return (order[a.type] || 0) - (order[b.type] || 0);
  });

  // Draw each text element
  for (const element of sortedElements) {
    if (element.text && element.text.trim()) {
      logger.info(`   ✏️ Drawing ${element.type}: "${element.text.substring(0, 30)}..."`);
      drawStyledText(ctx, element, width, height);
    }
  }

  // Generate output
  const outputDir = getOutputDir();
  const timestamp = Date.now();
  const format = input.outputFormat || 'png';
  const filename = `${timestamp}_composed_pro.${format}`;
  const outputPath = path.join(outputDir, filename);

  // Save to file
  const buffer = format === 'jpeg' 
    ? canvas.toBuffer('image/jpeg', { quality: (input.quality || 92) / 100 })
    : canvas.toBuffer('image/png');
  
  fs.writeFileSync(outputPath, buffer);

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('✅ PRO TEXT COMPOSITOR - Complete');
  logger.info(`📁 Output: ${outputPath}`);
  logger.info('═══════════════════════════════════════════════════════════════');

  return {
    imagePath: outputPath,
    imageBase64: buffer.toString('base64'),
    width,
    height,
  };
}

/**
 * Generate a professional default layout based on text content
 */
export function generateDefaultLayout(
  textContent: { headline?: string; subheadline?: string; cta?: string },
  theme: 'light' | 'dark' = 'dark'
): CompositionLayout {
  const elements: TextElement[] = [];
  
  const textColor = theme === 'dark' ? '#FFFFFF' : '#1A1A1A';
  const shadowColor = theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';

  if (textContent.headline) {
    elements.push({
      text: textContent.headline,
      type: 'headline',
      position: { x: 50, y: 12, anchor: 'center' },
      style: {
        fontFamily: 'Arial',
        fontSize: 72,
        fontWeight: '700',
        color: textColor,
        textTransform: 'uppercase',
        letterSpacing: 2,
        lineHeight: 1.1,
        maxWidth: 85,
        shadow: {
          color: shadowColor,
          blur: 12,
          offsetX: 0,
          offsetY: 4,
        },
      },
    });
  }

  if (textContent.subheadline) {
    elements.push({
      text: textContent.subheadline,
      type: 'subheadline',
      position: { x: 50, y: 25, anchor: 'center' },
      style: {
        fontFamily: 'Arial',
        fontSize: 32,
        fontWeight: '400',
        color: textColor,
        letterSpacing: 1,
        lineHeight: 1.3,
        maxWidth: 75,
        shadow: {
          color: shadowColor,
          blur: 8,
          offsetX: 0,
          offsetY: 2,
        },
      },
    });
  }

  // ONLY add CTA if explicitly provided and not empty
  if (textContent.cta && textContent.cta.trim() && textContent.cta.trim().length > 0) {
    elements.push({
      text: textContent.cta,
      type: 'cta',
      position: { x: 50, y: 88, anchor: 'center' },
      style: {
        fontFamily: 'Arial',
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: 2,
        background: {
          color: '#1a1a1a',
          paddingX: 28,
          paddingY: 14,
          borderRadius: 4,
        },
      },
    });
  }

  return { elements, theme };
}

