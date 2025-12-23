import fs from "node:fs";
import opentype from "opentype.js";
import type { TextOverlay } from "../schema/renderSpec";
import { tryGetFontFilePath } from "../fonts/fontRegistry";

export type LaidOutText = {
  fontFilePath?: string;
  fontSize: number;
  lineHeight: number;
  lines: string[];
  innerX: number;
  innerY: number;
  innerWidth: number;
  innerHeight: number;
  startX: number;
  firstBaselineY: number;
  textAnchor: "start" | "middle" | "end";
};

type CachedFont = { font: opentype.Font; filePath: string };
const fontCache = new Map<string, CachedFont>();

function loadFont(filePath: string): opentype.Font {
  const cached = fontCache.get(filePath);
  if (cached) return cached.font;
  const buf = fs.readFileSync(filePath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  fontCache.set(filePath, { font, filePath });
  return font;
}

export function layoutTextOverlay(args: { overlay: TextOverlay; fontsDir: string }): LaidOutText {
  const o = args.overlay;

  const padding = o.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const innerX = o.box.x + padding.left;
  const innerY = o.box.y + padding.top;
  const innerWidth = Math.max(0, o.box.width - padding.left - padding.right);
  const innerHeight = Math.max(0, o.box.height - padding.top - padding.bottom);

  const fontFilePath = tryGetFontFilePath({
    fontsDir: args.fontsDir,
    family: o.font.family,
    weight: o.font.weight,
    style: o.font.style,
  });
  const font = fontFilePath ? loadFont(fontFilePath) : undefined;

  const baseSize = o.font.size;
  const baseLineHeight = o.font.lineHeight;
  const lineHeightRatio = baseLineHeight / baseSize;
  const letterSpacing = o.font.letterSpacing ?? 0;

  let chosenSize = baseSize;
  let chosenLineHeight = baseLineHeight;
  let lines: string[] = [];

  const isAuto = o.overflow === "auto";
  const shouldShrink = o.overflow === "shrink" || isAuto;
  const minSize = shouldShrink ? o.minFontSize : baseSize;
  for (let size = baseSize; size >= minSize; size -= 1) {
    const lh = size * lineHeightRatio;
    const wrapped = wrapText({
      text: o.text,
      font,
      fontSize: size,
      letterSpacing,
      maxWidth: innerWidth,
    });

    const maxByHeight = lh > 0 ? Math.max(0, Math.floor(innerHeight / lh)) : 0;
    const heightLimit = isAuto || o.overflow === "ellipsis" ? maxByHeight : Number.POSITIVE_INFINITY;
    const maxLinesLimit = o.maxLines ?? Number.POSITIVE_INFINITY;
    const allowedLines = Math.min(heightLimit, maxLinesLimit);

    // For shrink/auto we must treat maxLines/height as constraints (not truncate early).
    // Otherwise a too-long word will be sliced to the first chunk and appear "cut".
    const hasTooManyLines = wrapped.length > allowedLines;
    const totalHeight = wrapped.length * lh;
    const widest = maxLineWidth(wrapped, font, size, letterSpacing);

    const fitsWidth = widest <= innerWidth + 1e-6;
    const fitsHeight = totalHeight <= innerHeight + 1e-6;
    const fitsLineCount = !Number.isFinite(allowedLines) || !hasTooManyLines;

    chosenSize = size;
    chosenLineHeight = lh;
    lines = wrapped;

    if (!shouldShrink) break;
    if (fitsWidth && fitsHeight && fitsLineCount) break;
  }

  // Apply constraints after size is chosen.
  // - If maxLines/height is constraining (auto/ellipsis), truncate to visible lines.
  // - If overflow is ellipsis OR auto at min size and still doesn't fit, ellipsize last visible line.
  if (isAuto) {
    const lh = chosenLineHeight;
    const maxByHeight = lh > 0 ? Math.max(0, Math.floor(innerHeight / lh)) : 0;
    const visibleCount = Math.min(o.maxLines ?? Number.POSITIVE_INFINITY, maxByHeight, lines.length);
    if (lines.length > visibleCount) lines = lines.slice(0, visibleCount);

    const widest = maxLineWidth(lines, font, chosenSize, letterSpacing);
    const totalHeight = lines.length * lh;
    const stillDoesNotFit = widest > innerWidth + 1e-6 || totalHeight > innerHeight + 1e-6;

    // If we hit min font size and still can't fit, ellipsize last line as final fallback.
    if (stillDoesNotFit && chosenSize <= minSize && lines.length > 0) {
      const lastIdx = lines.length - 1;
      lines[lastIdx] = ellipsizeLine({
        line: lines[lastIdx] ?? "",
        font,
        fontSize: chosenSize,
        letterSpacing,
        maxWidth: innerWidth,
      });
    }
  } else if (o.overflow === "ellipsis") {
    const lh = chosenLineHeight;
    const maxByHeight = lh > 0 ? Math.max(0, Math.floor(innerHeight / lh)) : 0;
    const visibleCount = Math.min(o.maxLines ?? Number.POSITIVE_INFINITY, maxByHeight, lines.length);
    const needsEllipsis = lines.length > visibleCount;
    lines = lines.slice(0, visibleCount);
    if (needsEllipsis && lines.length > 0) {
      const lastIdx = lines.length - 1;
      lines[lastIdx] = ellipsizeLine({
        line: lines[lastIdx] ?? "",
        font,
        fontSize: chosenSize,
        letterSpacing,
        maxWidth: innerWidth,
      });
    }
  } else if (o.maxLines !== undefined) {
    lines = lines.slice(0, o.maxLines);
  }

  // Baseline metrics
  const ascentPx = font ? (font.ascender / font.unitsPerEm) * chosenSize : chosenSize * 0.8;
  const totalTextHeight = lines.length * chosenLineHeight;

  let topY = innerY;
  if (o.verticalAlign === "middle") {
    topY = innerY + (innerHeight - totalTextHeight) / 2;
  } else if (o.verticalAlign === "bottom") {
    topY = innerY + innerHeight - totalTextHeight;
  }

  const firstBaselineY = topY + ascentPx;

  const { startX, textAnchor } = computeAlign(innerX, innerWidth, o.align);

  return {
    fontFilePath,
    fontSize: chosenSize,
    lineHeight: chosenLineHeight,
    lines,
    innerX,
    innerY,
    innerWidth,
    innerHeight,
    startX,
    firstBaselineY,
    textAnchor,
  };
}

function computeAlign(innerX: number, innerW: number, align: TextOverlay["align"]) {
  if (align === "center") return { startX: innerX + innerW / 2, textAnchor: "middle" as const };
  if (align === "right") return { startX: innerX + innerW, textAnchor: "end" as const };
  return { startX: innerX, textAnchor: "start" as const };
}

function tokenizeParagraph(p: string): string[] {
  const trimmed = p.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(" ");
}

function wrapText(args: {
  text: string;
  font?: opentype.Font;
  fontSize: number;
  letterSpacing: number;
  maxWidth: number;
}): string[] {
  const paragraphs = args.text.split("\n");
  const out: string[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi] ?? "";
    const words = tokenizeParagraph(p);
    if (words.length === 0) {
      out.push("");
      continue;
    }

    let line = "";
    for (const w of words) {
      const candidate = line.length === 0 ? w : `${line} ${w}`;
      if (measureTextWidth(candidate, args.font, args.fontSize, args.letterSpacing) <= args.maxWidth + 1e-6) {
        line = candidate;
        continue;
      }

      if (line.length > 0) out.push(line);
      // word itself may be too long => char wrap
      if (measureTextWidth(w, args.font, args.fontSize, args.letterSpacing) <= args.maxWidth + 1e-6) {
        line = w;
      } else {
        const parts = breakWordByChars(w, args.font, args.fontSize, args.letterSpacing, args.maxWidth);
        for (let i = 0; i < parts.length - 1; i++) out.push(parts[i]!);
        line = parts[parts.length - 1] ?? "";
      }
    }
    if (line.length > 0) out.push(line);
  }

  return out;
}

function breakWordByChars(
  word: string,
  font: opentype.Font | undefined,
  fontSize: number,
  letterSpacing: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of [...word]) {
    const cand = buf + ch;
    if (measureTextWidth(cand, font, fontSize, letterSpacing) <= maxWidth + 1e-6) {
      buf = cand;
    } else {
      if (buf.length > 0) out.push(buf);
      buf = ch;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

export function measureTextWidth(text: string, font: opentype.Font | undefined, fontSize: number, letterSpacing: number): number {
  if (text.length === 0) return 0;
  if (!font) {
    // deterministic fallback estimate when no font is available locally
    const avg = 0.62; // conservative average glyph width in ems
    const base = text.length * fontSize * avg;
    const extra = letterSpacing * Math.max(0, text.length - 1);
    return base + extra;
  }
  const glyphs = font.stringToGlyphs(text);
  let totalUnits = 0;
  for (const g of glyphs) {
    totalUnits += g.advanceWidth ?? font.unitsPerEm;
  }
  const base = (totalUnits / font.unitsPerEm) * fontSize;
  const extra = letterSpacing * Math.max(0, glyphs.length - 1);
  return base + extra;
}

function maxLineWidth(lines: string[], font: opentype.Font | undefined, fontSize: number, letterSpacing: number) {
  let max = 0;
  for (const l of lines) {
    const w = measureTextWidth(l, font, fontSize, letterSpacing);
    if (w > max) max = w;
  }
  return max;
}

function ellipsizeLine(args: {
  line: string;
  font: opentype.Font | undefined;
  fontSize: number;
  letterSpacing: number;
  maxWidth: number;
}) {
  const ell = "…";
  const full = args.line;
  if (measureTextWidth(full, args.font, args.fontSize, args.letterSpacing) <= args.maxWidth + 1e-6) return full;

  const ellW = measureTextWidth(ell, args.font, args.fontSize, args.letterSpacing);
  if (ellW > args.maxWidth) return "";

  const chars = [...full];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const s = chars.slice(0, mid).join("") + ell;
    const w = measureTextWidth(s, args.font, args.fontSize, args.letterSpacing);
    if (w <= args.maxWidth + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("") + ell;
}


