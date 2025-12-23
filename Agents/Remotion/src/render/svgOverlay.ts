import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RenderSpec, RectOverlay, TextOverlay } from "../schema/renderSpec";
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

export function buildSvgOverlay(args: { spec: RenderSpec; fontsDir: string }): string {
  const { width, height } = args.spec.canvas;

  const usedFonts = collectUsedFonts(args.spec, args.fontsDir);
  const fontFaces = usedFonts
    .map((f) => {
      const url = pathToFileURL(f.filePath).toString();
      const family = escapeXml(f.family);
      const weight = f.weight ?? 400;
      const style = f.style ?? "normal";
      return `@font-face{font-family:'${family}';src:url('${url}');font-weight:${weight};font-style:${style};}`;
    })
    .join("\n");

  const defs: string[] = [];
  defs.push(`<style>${fontFaces}</style>`);

  const body: string[] = [];
  const filters: string[] = [];
  const clipPaths: string[] = [];

  args.spec.overlays.forEach((ov, idx) => {
    if (ov.type === "rect") {
      body.push(renderRect(ov, idx));
    } else if (ov.type === "text") {
      const rendered = renderText(ov, idx, args.fontsDir);
      body.push(rendered.body);
      if (rendered.filterDef) filters.push(rendered.filterDef);
      if (rendered.clipDef) clipPaths.push(rendered.clipDef);
    } else {
      // Other overlay types are rendered by the advanced pipeline; skip here for safety.
    }
  });

  if (filters.length > 0) defs.push(filters.join("\n"));
  if (clipPaths.length > 0) defs.push(clipPaths.join("\n"));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    defs.join("\n"),
    `</defs>`,
    body.join("\n"),
    `</svg>`,
  ].join("\n");
}

function collectUsedFonts(spec: RenderSpec, fontsDir: string) {
  const set = new Map<string, { family: string; filePath: string; weight?: number; style?: "normal" | "italic" }>();
  for (const ov of spec.overlays) {
    if (ov.type !== "text") continue;
    const laid = layoutTextOverlay({ overlay: ov, fontsDir });
    if (!laid.fontFilePath) continue;
    const key = `${ov.font.family}::${laid.fontFilePath}::${ov.font.weight ?? 400}::${ov.font.style ?? "normal"}`;
    set.set(key, {
      family: ov.font.family,
      filePath: laid.fontFilePath,
      weight: ov.font.weight,
      style: ov.font.style,
    });
  }
  // deterministic order
  return [...set.values()].sort((a, b) => {
    const ap = path.basename(a.filePath);
    const bp = path.basename(b.filePath);
    if (a.family !== b.family) return a.family.localeCompare(b.family);
    if (ap !== bp) return ap.localeCompare(bp);
    if ((a.weight ?? 400) !== (b.weight ?? 400)) return (a.weight ?? 400) - (b.weight ?? 400);
    return (a.style ?? "normal").localeCompare(b.style ?? "normal");
  });
}

function renderRect(ov: RectOverlay, idx: number) {
  const fill = ov.fill ? ` fill="${escapeXml(ov.fill)}"` : ` fill="none"`;
  const stroke =
    ov.stroke && ov.stroke.width > 0
      ? ` stroke="${escapeXml(ov.stroke.color)}" stroke-width="${ov.stroke.width}"`
      : ``;
  const rx = ov.radius ? ` rx="${ov.radius}" ry="${ov.radius}"` : ``;
  return `<rect x="${ov.box.x}" y="${ov.box.y}" width="${ov.box.width}" height="${ov.box.height}"${rx}${fill}${stroke} />`;
}

function renderText(ov: TextOverlay, idx: number, fontsDir: string): { body: string; filterDef?: string; clipDef?: string } {
  const laid = layoutTextOverlay({ overlay: ov, fontsDir });
  const id = safeId(ov.id || `text_${idx}`);

  const groupAttrs: string[] = [];
  let filterDef: string | undefined;
  if (ov.shadow) {
    const filterId = `shadow_${id}`;
    const s = ov.shadow;
    // Use small padding so blur doesn't get clipped by filter region
    filterDef = `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${s.dx}" dy="${s.dy}" stdDeviation="${s.blur}" flood-color="${escapeXml(
      s.color,
    )}" /></filter>`;
    groupAttrs.push(`filter="url(#${filterId})"`);
  }

  let clipDef: string | undefined;
  if (ov.overflow === "clip" || ov.overflow === "ellipsis") {
    const clipId = `clip_${id}`;
    clipDef = `<clipPath id="${clipId}"><rect x="${ov.box.x}" y="${ov.box.y}" width="${ov.box.width}" height="${ov.box.height}" /></clipPath>`;
    groupAttrs.push(`clip-path="url(#${clipId})"`);
  }

  if (ov.transform) {
    const originX = ov.transform.originX ?? ov.box.x + ov.box.width / 2;
    const originY = ov.transform.originY ?? ov.box.y + ov.box.height / 2;
    groupAttrs.push(`transform="rotate(${ov.transform.rotateDeg} ${originX} ${originY})"`);
  }

  const parts: string[] = [];
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

  return { body: parts.join("\n"), filterDef, clipDef };
}


