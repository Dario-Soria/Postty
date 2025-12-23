import { pathToFileURL } from "node:url";
import type { ImageOverlay, PathOverlay, RectOverlay, RenderSpec, TextOverlay } from "../schema/renderSpec";
import { layoutTextOverlay } from "./textLayout";

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeId(s: string) {
  return s.replace(/[^A-Za-z0-9_:-]/g, "_");
}

export function buildVignetteSvg(args: {
  width: number;
  height: number;
  vignette: { strength: number; radius: number; color: string };
}) {
  const id = "vignette_g";
  const rPct = Math.max(0, Math.min(1, args.vignette.radius)) * 100;
  const strength = Math.max(0, Math.min(1, args.vignette.strength));
  const { rgb, alpha } = parseColor(args.vignette.color);
  const edgeOpacity = clamp01(strength * alpha);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}">`,
    `<defs>`,
    `<radialGradient id="${id}" cx="50%" cy="50%" r="${rPct}%">`,
    `<stop offset="0%" stop-color="${rgb}" stop-opacity="0" />`,
    `<stop offset="100%" stop-color="${rgb}" stop-opacity="${edgeOpacity}" />`,
    `</radialGradient>`,
    `</defs>`,
    `<rect x="0" y="0" width="${args.width}" height="${args.height}" fill="url(#${id})" />`,
    `</svg>`,
  ].join("\n");
}

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function parseColor(input: string): { rgb: string; alpha: number } {
  const s = input.trim();
  const hex = /^#([0-9a-fA-F]{6})$/.exec(s);
  if (hex) return { rgb: `#${hex[1]}`, alpha: 1 };
  const rgba =
    /^rgba\(\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(0|0?\.\d+|1(\.0+)?)\s*\)$/.exec(
      s,
    );
  if (rgba) {
    const r = Number(rgba[1]);
    const g = Number(rgba[2]);
    const b = Number(rgba[3]);
    const a = Number(rgba[4]);
    return { rgb: `rgb(${r},${g},${b})`, alpha: isFinite(a) ? a : 1 };
  }
  // fallback
  return { rgb: "#000000", alpha: 1 };
}

export function buildOverlaySvg(args: {
  width: number;
  height: number;
  fontsDir: string;
  overlay: TextOverlay | RectOverlay | PathOverlay | ImageOverlay;
  image?: { buffer: Buffer; mimeType: string };
}): string {
  const overlay = args.overlay;
  const defs: string[] = [];
  const body: string[] = [];

  if (overlay.type === "text") {
    const laid = layoutTextOverlay({ overlay, fontsDir: args.fontsDir });
    if (laid.fontFilePath) {
      const url = pathToFileURL(laid.fontFilePath).toString();
      const family = escapeXml(overlay.font.family);
      const weight = overlay.font.weight ?? 400;
      const style = overlay.font.style ?? "normal";
      defs.push(`<style>@font-face{font-family:'${family}';src:url('${url}');font-weight:${weight};font-style:${style};}</style>`);
    }
    body.push(renderText(overlay, args.fontsDir, 0));
  } else if (overlay.type === "rect") {
    body.push(renderRect(overlay));
  } else if (overlay.type === "path") {
    body.push(renderPath(overlay));
  } else if (overlay.type === "image") {
    body.push(renderImageOverlay(overlay, args.image));
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}">`,
    defs.length ? `<defs>${defs.join("\n")}</defs>` : `<defs></defs>`,
    body.join("\n"),
    `</svg>`,
  ].join("\n");
}

function renderRect(ov: RectOverlay) {
  const wrapStart = ov.opacity !== undefined && ov.opacity !== 1 ? `<g opacity="${ov.opacity}">` : ``;
  const wrapEnd = wrapStart ? `</g>` : ``;
  const fill = ov.fill ? ` fill="${escapeXml(ov.fill)}"` : ` fill="none"`;
  const stroke =
    ov.stroke && ov.stroke.width > 0
      ? ` stroke="${escapeXml(ov.stroke.color)}" stroke-width="${ov.stroke.width}"`
      : ``;
  const rx = ov.radius ? ` rx="${ov.radius}" ry="${ov.radius}"` : ``;
  return `${wrapStart}<rect x="${ov.box.x}" y="${ov.box.y}" width="${ov.box.width}" height="${ov.box.height}"${rx}${fill}${stroke} />${wrapEnd}`;
}

function renderPath(ov: PathOverlay) {
  const id = safeId(ov.id ?? "path");
  const groupAttrs: string[] = [];
  if (ov.transform) {
    const originX = ov.transform.originX ?? 0;
    const originY = ov.transform.originY ?? 0;
    groupAttrs.push(`transform="rotate(${ov.transform.rotateDeg} ${originX} ${originY})"`);
  }
  const opacity = ov.opacity ?? 1;
  if (opacity !== 1) groupAttrs.push(`opacity="${opacity}"`);

  const fill = ov.fill ? escapeXml(ov.fill) : "none";
  const strokeAttrs =
    ov.stroke && ov.stroke.width > 0 ? `stroke="${escapeXml(ov.stroke.color)}" stroke-width="${ov.stroke.width}"` : ``;

  const paths = ov.paths
    .map((p, idx) => `<path id="${id}_${idx}" d="${escapeXml(p.d)}" fill="${fill}" ${strokeAttrs} />`)
    .join("\n");

  return `<g id="${id}" ${groupAttrs.join(" ")}>\n${paths}\n</g>`;
}

function renderText(ov: TextOverlay, fontsDir: string, idx: number) {
  const laid = layoutTextOverlay({ overlay: ov, fontsDir });
  const id = safeId(ov.id || `text_${idx}`);

  const groupAttrs: string[] = [];
  let filterDef: string | undefined;
  const defs: string[] = [];
  if (ov.shadow) {
    const filterId = `shadow_${id}`;
    const s = ov.shadow;
    defs.push(
      `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${s.dx}" dy="${s.dy}" stdDeviation="${s.blur}" flood-color="${escapeXml(
        s.color,
      )}" /></filter>`,
    );
    groupAttrs.push(`filter="url(#${filterId})"`);
  }

  let clipDef: string | undefined;
  if (ov.overflow === "clip" || ov.overflow === "ellipsis") {
    const clipId = `clip_${id}`;
    clipDef = `<clipPath id="${clipId}"><rect x="${ov.box.x}" y="${ov.box.y}" width="${ov.box.width}" height="${ov.box.height}" /></clipPath>`;
    defs.push(clipDef);
    groupAttrs.push(`clip-path="url(#${clipId})"`);
  }

  if (ov.transform) {
    const originX = ov.transform.originX ?? ov.box.x + ov.box.width / 2;
    const originY = ov.transform.originY ?? ov.box.y + ov.box.height / 2;
    groupAttrs.push(`transform="rotate(${ov.transform.rotateDeg} ${originX} ${originY})"`);
  }
  const opacity = ov.opacity ?? 1;
  if (opacity !== 1) groupAttrs.push(`opacity="${opacity}"`);

  const parts: string[] = [];
  if (defs.length) parts.push(`<defs>${defs.join("\n")}</defs>`);

  parts.push(`<g id="${id}" ${groupAttrs.join(" ")}>`); // safeId ensures no spaces

  if (ov.background) {
    const r = ov.background.radius ?? 0;
    const op = ov.background.opacity ?? 1;
    parts.push(
      `<rect x="${ov.box.x}" y="${ov.box.y}" width="${ov.box.width}" height="${ov.box.height}" rx="${r}" ry="${r}" fill="${escapeXml(
        ov.background.color,
      )}" fill-opacity="${op}" />`,
    );
  }

  const fill = escapeXml(ov.fill);
  const family = laid.fontFilePath ? escapeXml(ov.font.family) : "sans-serif";
  const fontWeight = ov.font.weight ?? 400;
  const fontStyle = ov.font.style ?? "normal";
  const letterSpacing = ov.font.letterSpacing !== undefined ? ` letter-spacing="${ov.font.letterSpacing}"` : "";

  const strokeAttrs =
    ov.stroke && ov.stroke.width > 0
      ? ` stroke="${escapeXml(ov.stroke.color)}" stroke-width="${ov.stroke.width}" paint-order="stroke fill"`
      : "";

  const textOpen = `<text x="${laid.startX}" y="${laid.firstBaselineY}" text-anchor="${laid.textAnchor}" font-family="${family}" font-size="${laid.fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" fill="${fill}"${letterSpacing}${strokeAttrs}>`;
  parts.push(textOpen);

  const dy = laid.lineHeight;
  for (let i = 0; i < laid.lines.length; i++) {
    const line = laid.lines[i] ?? "";
    if (i === 0) {
      parts.push(`<tspan x="${laid.startX}" dy="0">${escapeXml(line)}</tspan>`);
    } else {
      parts.push(`<tspan x="${laid.startX}" dy="${dy}">${escapeXml(line)}</tspan>`);
    }
  }

  parts.push(`</text>`);
  parts.push(`</g>`);

  return parts.join("\n");
}

function renderImageOverlay(ov: ImageOverlay, img?: { buffer: Buffer; mimeType: string } | null) {
  const id = safeId(ov.id ?? "image");
  if (!img) {
    return `<g id="${id}"></g>`;
  }
  const href = `data:${img.mimeType};base64,${img.buffer.toString("base64")}`;
  const preserve =
    ov.fit === "stretch" ? "none" : ov.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";

  const groupAttrs: string[] = [];
  const defs: string[] = [];

  if (ov.shadow) {
    const filterId = `shadow_${id}`;
    const s = ov.shadow;
    defs.push(
      `<filter id="${filterId}" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="${s.dx}" dy="${s.dy}" stdDeviation="${s.blur}" flood-color="${escapeXml(
        s.color,
      )}" /></filter>`,
    );
    groupAttrs.push(`filter="url(#${filterId})"`);
  }
  if (ov.transform) {
    const originX = ov.transform.originX ?? ov.box.x + ov.box.width / 2;
    const originY = ov.transform.originY ?? ov.box.y + ov.box.height / 2;
    groupAttrs.push(`transform="rotate(${ov.transform.rotateDeg} ${originX} ${originY})"`);
  }
  const opacity = ov.opacity ?? 1;
  if (opacity !== 1) groupAttrs.push(`opacity="${opacity}"`);

  const parts: string[] = [];
  if (defs.length) parts.push(`<defs>${defs.join("\n")}</defs>`);
  parts.push(`<g id="${id}" ${groupAttrs.join(" ")}>`);
  parts.push(
    `<image href="${href}" x="${ov.box.x}" y="${ov.box.y}" width="${ov.box.width}" height="${ov.box.height}" preserveAspectRatio="${preserve}" />`,
  );
  parts.push(`</g>`);
  return parts.join("\n");
}


