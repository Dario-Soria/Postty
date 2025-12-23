import fs from "node:fs";
import path from "node:path";

type GoogleFontsListResponse = {
  items?: Array<{
    family: string;
    files: Record<string, string>;
  }>;
};

export type ResolveFontArgs = {
  fontsDir: string;
  fontFamily: string;
  fontWeight?: string | number;
  fontStyle?: string;
};

export type ResolvedFont = {
  familyUsed: string;
  localPath: string;
  variantKey: string;
};

const listCache: { promise?: Promise<GoogleFontsListResponse>; value?: GoogleFontsListResponse } = {};
const downloadLocks = new Map<string, Promise<ResolvedFont | null>>();

export function normalizeFamilyForMatch(family: string) {
  return family.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeFamilyForPath(family: string) {
  return normalizeFamilyForMatch(family).replace(/\s+/g, "-");
}

export function normalizeWeight(w?: string | number): number {
  if (typeof w === "number" && Number.isFinite(w)) return clampWeight(Math.round(w));
  if (typeof w === "string") {
    const t = w.trim().toLowerCase();
    if (t === "regular") return 400;
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n)) return clampWeight(n);
  }
  return 400;
}

function clampWeight(w: number) {
  if (w < 100) return 100;
  if (w > 900) return 900;
  return Math.round(w / 100) * 100;
}

export function normalizeStyle(s?: string): "normal" | "italic" {
  const t = (s ?? "normal").trim().toLowerCase();
  return t === "italic" ? "italic" : "normal";
}

export function localFontPath(args: {
  fontsDir: string;
  family: string;
  weight: number;
  style: "normal" | "italic";
}) {
  const familyDir = normalizeFamilyForPath(args.family);
  return path.join(args.fontsDir, familyDir, `${args.weight}-${args.style}.ttf`);
}

export async function resolveFontPath(
  args: ResolveFontArgs,
  deps?: { fetchFn?: typeof fetch; apiKey?: string; logger?: Pick<Console, "warn" | "error"> },
): Promise<ResolvedFont | null> {
  const apiKey = deps?.apiKey ?? process.env.GOOGLE_FONTS_API_KEY ?? process.env.GOOGLE_FONT_KEY;
  const fetchFn = deps?.fetchFn ?? fetch;
  const logger = deps?.logger ?? console;

  const family = args.fontFamily ?? "";
  const weight = normalizeWeight(args.fontWeight);
  const style = normalizeStyle(args.fontStyle);

  const targetPath = localFontPath({ fontsDir: args.fontsDir, family, weight, style });
  if (fs.existsSync(targetPath)) {
    return { familyUsed: family, localPath: targetPath, variantKey: String(weight) };
  }

  // async-safe: one download per font variant
  const lockKey = `${normalizeFamilyForPath(family)}::${weight}::${style}`;
  const existingLock = downloadLocks.get(lockKey);
  if (existingLock) return existingLock;

  const p = (async (): Promise<ResolvedFont | null> => {
    try {
      // re-check after lock acquired
      if (fs.existsSync(targetPath)) return { familyUsed: family, localPath: targetPath, variantKey: String(weight) };

      if (!apiKey) {
        logger.warn(`[FontManager] GOOGLE_FONTS_API_KEY missing; cannot fetch '${family}'.`);
        return null;
      }

      const list = await getGoogleFontsList({ apiKey, fetchFn });
      const items = list.items ?? [];
      if (items.length === 0) {
        logger.warn(`[FontManager] Google Fonts list empty; cannot fetch '${family}'.`);
        return null;
      }

      const match = findBestFamilyMatch(items, family);
      if (!match) {
        logger.warn(`[FontManager] Font family '${family}' not found; using fallback.`);
        return null;
      }

      const variantUrl = pickVariantUrl(match.files, weight);
      if (!variantUrl) {
        logger.warn(`[FontManager] No downloadable variant for '${match.family}'; using fallback.`);
        return null;
      }

      const resolvedFamily = match.family;
      const finalPath = localFontPath({ fontsDir: args.fontsDir, family: resolvedFamily, weight, style });
      if (fs.existsSync(finalPath)) {
        return { familyUsed: resolvedFamily, localPath: finalPath, variantKey: variantUrl.variantKey };
      }

      await downloadToFile({
        url: variantUrl.url,
        finalPath,
        fetchFn,
      });

      return { familyUsed: resolvedFamily, localPath: finalPath, variantKey: variantUrl.variantKey };
    } catch (e: any) {
      logger.error(`[FontManager] Failed to resolve '${args.fontFamily}': ${e?.message ?? e}`);
      return null;
    } finally {
      downloadLocks.delete(lockKey);
    }
  })();

  downloadLocks.set(lockKey, p);
  return p;
}

async function getGoogleFontsList(args: { apiKey: string; fetchFn: typeof fetch }): Promise<GoogleFontsListResponse> {
  if (listCache.value) return listCache.value;
  if (listCache.promise) return listCache.promise;

  listCache.promise = (async () => {
    const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(args.apiKey)}`;
    const res = await args.fetchFn(url, { method: "GET" });
    if (!res.ok) throw new Error(`Google Fonts API error: ${res.status}`);
    const data = (await res.json()) as GoogleFontsListResponse;
    listCache.value = data;
    return data;
  })();

  return listCache.promise;
}

function findBestFamilyMatch(
  items: Array<{ family: string; files: Record<string, string> }>,
  requestedFamily: string,
) {
  const req = normalizeFamilyForMatch(requestedFamily);
  let exact: { family: string; files: Record<string, string> } | undefined;
  for (const it of items) {
    if (normalizeFamilyForMatch(it.family) === req) {
      exact = it;
      break;
    }
  }
  if (exact) return exact;

  // most similar
  let best: { family: string; files: Record<string, string> } | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const it of items) {
    const score = levenshtein(req, normalizeFamilyForMatch(it.family));
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

function pickVariantUrl(files: Record<string, string>, desiredWeight: number): { url: string; variantKey: string } | null {
  const exactKey = String(desiredWeight);
  if (files[exactKey]) return { url: files[exactKey]!, variantKey: exactKey };
  if (files["regular"]) return { url: files["regular"]!, variantKey: "regular" };
  const keys = Object.keys(files).sort();
  if (keys.length === 0) return null;
  const k = keys[0]!;
  return { url: files[k]!, variantKey: k };
}

async function downloadToFile(args: { url: string; finalPath: string; fetchFn: typeof fetch }) {
  const dir = path.dirname(args.finalPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = `${args.finalPath}.tmp.${process.pid}.${Date.now()}`;
  const res = await args.fetchFn(args.url, { method: "GET" });
  if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length <= 0) throw new Error("Downloaded font is empty");
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, args.finalPath);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const dp = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) dp[j] = j;

  for (let i = 1; i <= al; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= bl; j++) {
      const temp = dp[j]!;
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[bl]!;
}


