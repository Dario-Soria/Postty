export function resolveImageSource(
  src: string,
  assets: Record<string, { buffer: Buffer; mimeType: string; filename?: string }>,
): { buffer: Buffer; mimeType: string } | null {
  if (!src || typeof src !== "string") return null;

  if (src.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/i.exec(src);
    if (!m) return null;
    const mimeType = m[1]!;
    const b64 = m[2]!;
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0) return null;
    return { buffer: buf, mimeType };
  }

  if (src.startsWith("ASSET:")) {
    const token = src.slice("ASSET:".length).trim();
    const keys = candidateAssetKeys(token);
    for (const k of keys) {
      const hit = assets[k];
      if (hit && hit.buffer.length > 0) return { buffer: hit.buffer, mimeType: hit.mimeType };
    }
    return null;
  }

  // Unknown scheme
  return null;
}

function candidateAssetKeys(token: string) {
  const raw = token;
  const lower = token.toLowerCase();
  const norm = token.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return [
    `asset_${raw}`,
    `asset_${lower}`,
    `asset_${norm}`,
    raw,
    lower,
    norm,
  ];
}


