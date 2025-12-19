import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as logger from '../utils/logger';

function ensureOutputDir(): string {
  const dir = path.join(process.cwd(), 'generated-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Composite a foreground (typically the user-uploaded product photo) on top of a background image.
 * This provides a deterministic fallback that *guarantees* the uploaded image appears in the result
 * even when image-conditioned generation is blocked by safety systems.
 */
export async function compositeForegroundOnBackground(params: {
  backgroundPath: string;
  foregroundPath: string;
  outSize?: number; // default 1080
  // Foreground sizing relative to background width (0.2..0.9). Default 0.55.
  foregroundWidthRatio?: number;
  // Foreground vertical placement as ratio of height (0..1). Default 0.62.
  centerYRatio?: number;
}): Promise<string> {
  const outSize = params.outSize ?? 1080;
  const fgRatio = Math.min(Math.max(params.foregroundWidthRatio ?? 0.55, 0.2), 0.9);
  const cy = Math.min(Math.max(params.centerYRatio ?? 0.62, 0.2), 0.9);

  if (!fs.existsSync(params.backgroundPath)) {
    throw new Error(`Background file does not exist: ${params.backgroundPath}`);
  }
  if (!fs.existsSync(params.foregroundPath)) {
    throw new Error(`Foreground file does not exist: ${params.foregroundPath}`);
  }

  const outputDir = ensureOutputDir();
  const outPath = path.join(outputDir, `${Date.now()}_composited_1080.png`);

  try {
    // Prepare background: square cover crop to outSize.
    const bg = sharp(params.backgroundPath).resize(outSize, outSize, { fit: 'cover', position: 'centre' });

    // Prepare foreground: resize to target width and keep aspect.
    const fgTargetW = Math.round(outSize * fgRatio);
    const fgBuf = await sharp(params.foregroundPath)
      .resize({ width: fgTargetW, height: fgTargetW, fit: 'inside' })
      .png()
      .toBuffer();

    const fgMeta = await sharp(fgBuf).metadata();
    const fgW = fgMeta.width ?? fgTargetW;
    const fgH = fgMeta.height ?? fgTargetW;

    // Place foreground centered horizontally, with configurable Y center.
    const left = Math.round((outSize - fgW) / 2);
    const top = Math.round(outSize * cy - fgH / 2);

    await bg
      .composite([
        {
          input: fgBuf,
          left: Math.max(0, Math.min(left, outSize - fgW)),
          top: Math.max(0, Math.min(top, outSize - fgH)),
        },
      ])
      .png({ quality: 92 })
      .toFile(outPath);

    logger.info(`✓ Composited foreground on background: ${outPath}`);
    return outPath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error occurred';
    logger.error('Failed to composite images:', msg);
    throw new Error(`Image compositing failed: ${msg}`);
  }
}


