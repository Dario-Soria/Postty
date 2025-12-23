import sharp from "sharp";
import crypto from "node:crypto";
import type { BlendMode, ImageOverlay, Overlay, PathOverlay, RectOverlay, RenderSpec, TextOverlay } from "../schema/renderSpec";
import { prepareBackgroundLayer } from "./background";
import { buildSvgOverlay } from "./svgOverlay";
import { buildOverlaySvg, buildVignetteSvg } from "./svgOverlayAdvanced";
import { resolveImageSource } from "./assets";

export async function renderImage(args: {
  background: Buffer;
  backgroundMimeType: "image/png" | "image/jpeg";
  spec: RenderSpec;
  fontsDir: string;
  logger?: { warn: (msg: any, ...args: any[]) => void; error: (msg: any, ...args: any[]) => void };
}): Promise<Buffer> {
  const { width, height, backgroundFit, backgroundPosition } = args.spec.canvas;

  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const bgLayer = await prepareBackgroundLayer({
    imageBuffer: args.background,
    canvasWidth: width,
    canvasHeight: height,
    fit: backgroundFit,
    positionX: backgroundPosition.x,
    positionY: backgroundPosition.y,
  });

  const needsAdvanced =
    Boolean(args.spec.canvas.effects) ||
    args.spec.overlays.some(
      (o) => o.type === "image" || o.type === "path" || (o as any).blendMode || ((o as any).opacity !== undefined && (o as any).opacity !== 1),
    );

  if (!needsAdvanced) {
    // Preserve the original rendering behavior for classic payloads.
    const svg = buildSvgOverlay({ spec: args.spec, fontsDir: args.fontsDir });
    const svgBuf = Buffer.from(svg);
    return await canvas
      .composite([
        { input: bgLayer.input, left: bgLayer.left, top: bgLayer.top },
        { input: svgBuf, left: 0, top: 0 },
      ])
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
  }

  // IMPORTANT: sharp().composite() replaces the internal composite list; it does not append.
  // So we must build a single composite array in render order and apply it once.
  const composites: Array<{ input: Buffer; left: number; top: number; blend?: any }> = [
    { input: bgLayer.input, left: bgLayer.left, top: bgLayer.top, blend: "over" },
  ];

  // canvas effects (applied after background, before overlays)
  const effects = args.spec.canvas.effects;
  if (effects?.vignette) {
    const vSvg = buildVignetteSvg({ width, height, vignette: effects.vignette });
    const vBuf = await sharp(Buffer.from(vSvg)).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    // Use 'over' to avoid alpha-masking issues observed with libvips multiply blend.
    composites.push({ input: vBuf, left: 0, top: 0, blend: "over" });
  }
  if (effects?.grain && effects.grain.opacity > 0 && effects.grain.amount > 0) {
    const seed = seedFromSpec(args.spec);
    const noise = await buildGrainLayer({
      width,
      height,
      amount: effects.grain.amount,
      size: effects.grain.size,
      opacity: effects.grain.opacity,
      seed,
    });
    // Use 'over' to keep determinism and avoid alpha-masking.
    composites.push({ input: noise, left: 0, top: 0, blend: "over" });
  }

  // overlays in order
  for (const ov of args.spec.overlays) {
    const layer = await renderOverlayLayer({
      overlay: ov,
      width,
      height,
      fontsDir: args.fontsDir,
      assets: {},
      logger: args.logger,
    });
    if (!layer) continue;
    composites.push({
      input: layer.png,
      left: 0,
      top: 0,
      blend: mapBlendMode((ov as any).blendMode),
    });
  }

  const out = await canvas.composite(composites as any).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();

  return out;
}

function mapBlendMode(mode?: BlendMode) {
  // NOTE: libvips blend modes can alter alpha in surprising ways; we currently
  // map everything to 'over' to preserve expected opaque output.
  // If you want true multiply/screen/etc later, we can implement safe versions.
  return "over" as const;
}

async function renderOverlayLayer(args: {
  overlay: Overlay;
  width: number;
  height: number;
  fontsDir: string;
  assets: Record<string, { buffer: Buffer; mimeType: string; filename?: string }>;
  logger?: { warn: (msg: any, ...rest: any[]) => void; error: (msg: any, ...rest: any[]) => void };
}): Promise<{ png: Buffer } | null> {
  if (args.overlay.type === "image") {
    const resolved = resolveImageSource(args.overlay.src, args.assets);
    if (!resolved) {
      args.logger?.warn?.({ src: args.overlay.src }, "Image asset missing; skipping image overlay");
      return null;
    }
    const svg = buildOverlaySvg({
      width: args.width,
      height: args.height,
      overlay: args.overlay,
      fontsDir: args.fontsDir,
      image: resolved,
    });
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    return { png };
  }

  if (args.overlay.type === "text" || args.overlay.type === "rect" || args.overlay.type === "path") {
    const svg = buildOverlaySvg({
      width: args.width,
      height: args.height,
      overlay: args.overlay as TextOverlay | RectOverlay | PathOverlay,
      fontsDir: args.fontsDir,
    });
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    return { png };
  }

  return null;
}

function seedFromSpec(spec: RenderSpec): number {
  const json = JSON.stringify(spec);
  const h = crypto.createHash("sha256").update(json).digest();
  return h.readUInt32LE(0);
}

async function buildGrainLayer(args: { width: number; height: number; amount: number; size: number; opacity: number; seed: number }) {
  const scale = Math.max(0.25, Math.min(8, args.size));
  const w = Math.max(1, Math.round(args.width / scale));
  const h = Math.max(1, Math.round(args.height / scale));

  const rng = xorshift32(args.seed);
  const raw = Buffer.allocUnsafe(w * h * 4);
  const a = clamp8(args.opacity * 255);
  for (let i = 0; i < w * h; i++) {
    // centered noise around mid-gray, scaled by amount
    const r = rng();
    const n = (r / 0xffffffff - 0.5) * 2; // -1..1
    const v = clamp8(128 + n * 128 * args.amount);
    const off = i * 4;
    raw[off + 0] = v;
    raw[off + 1] = v;
    raw[off + 2] = v;
    raw[off + 3] = a;
  }

  return await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
    .resize(args.width, args.height, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

function xorshift32(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

function clamp8(v: number) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}


