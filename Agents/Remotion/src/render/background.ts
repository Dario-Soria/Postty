import sharp from "sharp";

export type BackgroundFit = "cover" | "contain" | "stretch";

export async function prepareBackgroundLayer(args: {
  imageBuffer: Buffer;
  canvasWidth: number;
  canvasHeight: number;
  fit: BackgroundFit;
  positionX: number; // 0..1
  positionY: number; // 0..1
}): Promise<{ input: Buffer; left: number; top: number }> {
  const img = sharp(args.imageBuffer, { failOn: "error" }).ensureAlpha();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Unable to read background image dimensions");
  }

  const cw = args.canvasWidth;
  const ch = args.canvasHeight;
  const iw = meta.width;
  const ih = meta.height;

  if (args.fit === "stretch") {
    const buf = await img
      .resize(cw, ch, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
    return { input: buf, left: 0, top: 0 };
  }

  if (args.fit === "cover") {
    const scale = Math.max(cw / iw, ch / ih);
    const rw = Math.max(1, Math.round(iw * scale));
    const rh = Math.max(1, Math.round(ih * scale));
    const resized = img.resize(rw, rh, { fit: "fill", kernel: sharp.kernel.lanczos3 });

    const maxLeft = Math.max(0, rw - cw);
    const maxTop = Math.max(0, rh - ch);
    const left = Math.round(maxLeft * clamp01(args.positionX));
    const top = Math.round(maxTop * clamp01(args.positionY));

    const buf = await resized
      .extract({ left, top, width: cw, height: ch })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
    return { input: buf, left: 0, top: 0 };
  }

  // contain
  const scale = Math.min(cw / iw, ch / ih);
  const rw = Math.max(1, Math.round(iw * scale));
  const rh = Math.max(1, Math.round(ih * scale));
  const buf = await img
    .resize(rw, rh, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  const maxLeft = Math.max(0, cw - rw);
  const maxTop = Math.max(0, ch - rh);
  const left = Math.round(maxLeft * clamp01(args.positionX));
  const top = Math.round(maxTop * clamp01(args.positionY));
  return { input: buf, left, top };
}

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}


