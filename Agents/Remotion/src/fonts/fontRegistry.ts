import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import type { RenderSpec, TextOverlay } from "../schema/renderSpec";
import { FontValidationError } from "./fontErrors";

type FontVariant = {
  filePath: string;
  family: string;
  style: "normal" | "italic";
  weight: number;
};

type FontRegistry = Map<string, FontVariant[]>;

function isFontFile(p: string) {
  const ext = path.extname(p).toLowerCase();
  return ext === ".ttf" || ext === ".otf";
}

function safeString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return undefined;
}

function normalizeFamily(family: string) {
  return family.trim().toLowerCase();
}

function getFontFamily(font: opentype.Font): string {
  const name =
    safeString(font.names.fontFamily?.en) ??
    safeString((font.names as any).preferredFamily?.en) ??
    safeString(font.names.fullName?.en) ??
    "Unknown";

  // If fullName is used as fallback, try to strip style suffixes
  return name.replace(/\s+(Regular|Bold|Italic|Medium|Light|Thin|Black|Semibold|SemiBold|ExtraBold|ExtraLight)\s*$/i, "");
}

function getFontStyle(font: opentype.Font): "normal" | "italic" {
  const sub =
    safeString(font.names.fontSubfamily?.en) ??
    safeString((font.names as any).preferredSubfamily?.en) ??
    safeString(font.names.fullName?.en) ??
    "";

  return /italic/i.test(sub) ? "italic" : "normal";
}

function getFontWeight(font: opentype.Font): number {
  // OS/2 usWeightClass when present
  const os2 = (font as any).tables?.os2;
  const w = os2?.usWeightClass;
  if (typeof w === "number" && Number.isFinite(w)) return Math.max(100, Math.min(900, Math.round(w / 100) * 100));

  const sub =
    safeString(font.names.fontSubfamily?.en) ??
    safeString((font.names as any).preferredSubfamily?.en) ??
    safeString(font.names.fullName?.en) ??
    "";

  if (/thin/i.test(sub)) return 100;
  if (/extralight|extra light|ultralight|ultra light/i.test(sub)) return 200;
  if (/light/i.test(sub)) return 300;
  if (/regular|normal/i.test(sub)) return 400;
  if (/medium/i.test(sub)) return 500;
  if (/semibold|semi bold|demibold|demi bold/i.test(sub)) return 600;
  if (/bold/i.test(sub)) return 700;
  if (/extrabold|extra bold|ultrabold|ultra bold/i.test(sub)) return 800;
  if (/black|heavy/i.test(sub)) return 900;
  return 400;
}

function loadFontVariant(filePath: string): FontVariant {
  const buf = fs.readFileSync(filePath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return {
    filePath,
    family: getFontFamily(font),
    style: getFontStyle(font),
    weight: getFontWeight(font),
  };
}

function buildRegistry(fontsDir: string): FontRegistry {
  if (!fs.existsSync(fontsDir)) {
    throw new FontValidationError({
      code: "fonts_dir_missing",
      message: `Fonts directory not found at ${fontsDir}. Provide local .ttf/.otf fonts.`,
    });
  }

  const fontFiles = listFontFilesRecursive(fontsDir);

  if (fontFiles.length === 0) {
    throw new FontValidationError({
      code: "no_fonts_found",
      message: `No fonts found in ${fontsDir}. Add at least one .ttf/.otf file.`,
    });
  }

  const reg: FontRegistry = new Map();
  for (const file of fontFiles.sort()) {
    const v = loadFontVariant(file);
    const key = normalizeFamily(v.family);
    const list = reg.get(key) ?? [];
    list.push(v);
    reg.set(key, list);
  }

  // Sort variants deterministically
  for (const [k, list] of reg.entries()) {
    list.sort((a, b) => {
      if (a.style !== b.style) return a.style.localeCompare(b.style);
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.filePath.localeCompare(b.filePath);
    });
    reg.set(k, list);
  }

  return reg;
}

function listFontFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...listFontFilesRecursive(full));
    } else if (e.isFile() && isFontFile(full)) {
      out.push(full);
    }
  }
  return out.sort();
}

const registryCache = new Map<string, FontRegistry>();

export function getFontFilePath(args: {
  fontsDir: string;
  family: string;
  weight?: number;
  style?: "normal" | "italic";
}): string {
  const reg = registryCache.get(args.fontsDir) ?? buildRegistry(args.fontsDir);
  registryCache.set(args.fontsDir, reg);

  const key = normalizeFamily(args.family);
  const variants = reg.get(key);
  if (!variants || variants.length === 0) {
    throw new FontValidationError({
      code: "font_family_not_found",
      message: `Font family '${args.family}' not found in ${args.fontsDir}.`,
      family: args.family,
    });
  }

  const desiredStyle = args.style ?? "normal";
  const desiredWeight = args.weight ?? 400;

  const styleVariants = variants.filter((v) => v.style === desiredStyle);
  const pool = styleVariants.length > 0 ? styleVariants : variants;

  // pick closest weight, deterministic tie-breaker via sort order
  let best = pool[0]!;
  let bestDist = Math.abs(best.weight - desiredWeight);
  for (const v of pool) {
    const dist = Math.abs(v.weight - desiredWeight);
    if (dist < bestDist) {
      best = v;
      bestDist = dist;
    }
  }
  return best.filePath;
}

export function tryGetFontFilePath(args: {
  fontsDir: string;
  family: string;
  weight?: number;
  style?: "normal" | "italic";
}): string | undefined {
  try {
    return getFontFilePath(args);
  } catch {
    return undefined;
  }
}

export function validateFontsUsed(spec: RenderSpec, fontsDir: string) {
  const textOverlays: TextOverlay[] = spec.overlays.filter((o): o is TextOverlay => o.type === "text");
  for (const o of textOverlays) {
    // throws if missing
    getFontFilePath({
      fontsDir,
      family: o.font.family,
      weight: o.font.weight,
      style: o.font.style,
    });
  }
}


