import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as logger from '../utils/logger';
import { GeminiSubjectMaskResult } from './geminiMultimodal';
import { tryRembgCutout } from './segmentation/rembg';

function ensureOutputDir(): string {
  const dir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function polygonToSvgMask(params: {
  width: number;
  height: number;
  polygon: Array<{ x: number; y: number }>;
}): string {
  const pts = params.polygon
    .map((p) => `${Math.round(p.x * params.width)},${Math.round(p.y * params.height)}`)
    .join(' ');
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}">
      <rect width="100%" height="100%" fill="black"/>
      <polygon points="${pts}" fill="white"/>
    </svg>
  `.trim();
}

function bboxToSvgMask(params: {
  width: number;
  height: number;
  bbox: { x: number; y: number; w: number; h: number };
}): string {
  const x = Math.round(params.bbox.x * params.width);
  const y = Math.round(params.bbox.y * params.height);
  const w = Math.round(params.bbox.w * params.width);
  const h = Math.round(params.bbox.h * params.height);
  const rx = Math.round(Math.min(w, h) * 0.08);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}">
      <rect width="100%" height="100%" fill="black"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="white"/>
    </svg>
  `.trim();
}

/**
 * True-pixel merge (no AI editing): extract the product pixels using a Gemini-provided
 * polygon/bbox mask, then composite onto a background.
 */
export async function mergeProductOnBackground(params: {
  productPath: string;
  backgroundPath: string;
  mask: GeminiSubjectMaskResult | null;
  outSize?: number; // default 1080
  foregroundWidthRatio?: number; // default 0.42
  centerYRatio?: number; // default 0.62
}): Promise<string> {
  const outSize = params.outSize ?? 1080;
  const fgRatio = Math.min(Math.max(params.foregroundWidthRatio ?? 0.42, 0.18), 0.75);
  const cy = Math.min(Math.max(params.centerYRatio ?? 0.62, 0.2), 0.9);

  if (!fs.existsSync(params.productPath)) throw new Error(`Product file not found: ${params.productPath}`);
  if (!fs.existsSync(params.backgroundPath)) throw new Error(`Background file not found: ${params.backgroundPath}`);

  const outDir = ensureOutputDir();
  const outPath = path.join(outDir, `${Date.now()}_v2_merge_1080.png`);

  const product = sharp(params.productPath);
  const meta = await product.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error('Could not read product image dimensions');

  const svgMask =
    params.mask?.polygon && params.mask.polygon.length >= 6
      ? polygonToSvgMask({ width: w, height: h, polygon: params.mask.polygon })
      : params.mask?.bbox
        ? bboxToSvgMask({ width: w, height: h, bbox: params.mask.bbox })
        : bboxToSvgMask({ width: w, height: h, bbox: { x: 0.15, y: 0.15, w: 0.7, h: 0.7 } });

  const maskBuf = Buffer.from(svgMask);

  // Cutout:
  // 1) Prefer local rembg (if enabled + installed) to preserve exact pixels with better edges.
  // 2) Fall back to Gemini-provided polygon/bbox mask.
  let cutout: Buffer | null = null;
  try {
    const tempDir = path.join(process.cwd(), 'temp-uploads', 'v2');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const rembgOut = path.join(tempDir, `${Date.now()}_rembg_cutout.png`);
    const ok = await tryRembgCutout({ inputPath: params.productPath, outputPath: rembgOut });
    if (ok) cutout = fs.readFileSync(rembgOut);
  } catch {
    // ignore; fall back to mask compositing below
  }

  if (!cutout) {
    cutout = await sharp(params.productPath)
      .ensureAlpha()
      .composite([{ input: maskBuf, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  // Resize cutout for placement.
  const fgTargetW = Math.round(outSize * fgRatio);
  const fg = await sharp(cutout).resize({ width: fgTargetW, height: fgTargetW, fit: 'inside' }).png().toBuffer();
  const fgMeta = await sharp(fg).metadata();
  const fgW = fgMeta.width ?? fgTargetW;
  const fgH = fgMeta.height ?? fgTargetW;

  const left = Math.round((outSize - fgW) / 2);
  const top = Math.round(outSize * cy - fgH / 2);

  // Shadow (simple): duplicate cutout, darken, blur. Opacity applied at composite time.
  const shadow = await sharp(fg)
    .ensureAlpha()
    .modulate({ brightness: 0.0 })
    .blur(14)
    // Reduce alpha to ~35% so the shadow is subtle.
    .linear([1, 1, 1, 0.35], [0, 0, 0, 0])
    .png()
    .toBuffer()
    .catch(() => null);

  // Background to square.
  const bg = sharp(params.backgroundPath).resize(outSize, outSize, { fit: 'cover', position: 'centre' });

  const layers: sharp.OverlayOptions[] = [];
  if (shadow) {
    layers.push({ input: shadow, left: Math.max(0, left + 10), top: Math.max(0, top + 12) });
  }
  layers.push({ input: fg, left: Math.max(0, left), top: Math.max(0, top) });

  await bg.composite(layers).png({ quality: 92 }).toFile(outPath);
  logger.info(`✓ v2 merged product onto background: ${outPath}`);
  return outPath;
}


