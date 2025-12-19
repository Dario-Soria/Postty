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
 * Ensures an image is a 1080×1080 square suitable for Instagram feed posts.
 * Uses cover resize (center-crop) to avoid distortion.
 *
 * @returns Path to the resized PNG on disk.
 */
export async function ensureInstagramSquare1080(inputPath: string): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File does not exist: ${inputPath}`);
  }

  const outputDir = ensureOutputDir();
  const base = path.parse(inputPath).name;
  const outPath = path.join(outputDir, `${Date.now()}_${base}_1080.png`);

  try {
    await sharp(inputPath)
      .resize(1080, 1080, { fit: 'cover', position: 'centre' })
      .png({ quality: 90 })
      .toFile(outPath);

    logger.info(`✓ Resized image to 1080x1080: ${outPath}`);
    return outPath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error occurred';
    logger.error('Failed to resize image to 1080x1080:', msg);
    throw new Error(`Image resize failed: ${msg}`);
  }
}


