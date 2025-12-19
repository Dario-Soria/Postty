import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as logger from '../utils/logger';

export type PixabaySearchParams = {
  q: string;
  lang?: string;
  image_type?: 'all' | 'photo' | 'illustration' | 'vector';
  orientation?: 'all' | 'horizontal' | 'vertical';
  safesearch?: boolean;
  per_page?: number;
};

export type PixabaySelectedImage = {
  id: number;
  pageURL: string;
  tags: string;
  largeImageURL: string;
  imageWidth?: number;
  imageHeight?: number;
  localPath: string;
};

type PixabayHit = {
  id: number;
  pageURL: string;
  tags: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  downloads?: number;
  likes?: number;
};

type PixabayResponse = {
  total?: number;
  totalHits?: number;
  hits?: PixabayHit[];
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h (Pixabay caching requirement)
const bestCache = new Map<string, CacheEntry<PixabaySelectedImage>>();
const topCache = new Map<string, CacheEntry<PixabaySelectedImage[]>>();

function getApiKey(): string {
  const key = process.env.PIXABAY_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error('PIXABAY_API_KEY environment variable is not set');
  }
  return key.trim();
}

function ensurePixabayTempDir(): string {
  const dir = path.join(process.cwd(), 'temp-uploads', 'pixabay');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeQueryKey(params: PixabaySearchParams): string {
  const q = params.q.trim().toLowerCase().replace(/\s+/g, ' ');
  const lang = (params.lang || 'en').trim().toLowerCase();
  const image_type = params.image_type || 'photo';
  const orientation = params.orientation || 'all';
  const safesearch = params.safesearch === false ? 'false' : 'true';
  const per_page = Math.min(Math.max(params.per_page ?? 20, 3), 200);
  return JSON.stringify({ q, lang, image_type, orientation, safesearch, per_page });
}

function pickBestHit(hits: PixabayHit[]): PixabayHit | null {
  const usable = hits.filter((h) => h && typeof h.id === 'number' && typeof h.pageURL === 'string');
  if (usable.length === 0) return null;

  const score = (h: PixabayHit): number => {
    const w = typeof h.imageWidth === 'number' ? h.imageWidth : 0;
    const ht = typeof h.imageHeight === 'number' ? h.imageHeight : 0;
    const area = w * ht;
    const downloads = typeof h.downloads === 'number' ? h.downloads : 0;
    const likes = typeof h.likes === 'number' ? h.likes : 0;
    // Heuristic: prioritize resolution; then social proof.
    return area * 1_000_000 + downloads * 1000 + likes;
  };

  return usable.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function pickTopHitsInApiOrder(hits: PixabayHit[], count: number): PixabayHit[] {
  const n = Math.min(Math.max(count, 1), 25);
  const usable = hits.filter(
    (h) =>
      h &&
      typeof h.id === 'number' &&
      typeof h.pageURL === 'string' &&
      typeof h.largeImageURL === 'string' &&
      h.largeImageURL.trim().length > 0
  );
  return usable.slice(0, n);
}

async function downloadToTemp(url: string, id: number): Promise<string> {
  const dir = ensurePixabayTempDir();
  const ts = Date.now();
  const filePath = path.join(dir, `${ts}_pixabay_${id}.jpg`);

  const resp = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, resp.data);
  return filePath;
}

/**
 * Search Pixabay and download the selected image (largeImageURL) to the server.
 *
 * Notes:
 * - Results are cached for 24 hours to comply with Pixabay API caching requirements.
 * - We download the image rather than hotlinking.
 *
 * Docs: https://pixabay.com/api/docs/
 */
export async function fetchBestPixabayImage(params: PixabaySearchParams): Promise<PixabaySelectedImage> {
  const cacheKey = normalizeQueryKey(params);
  const cached = bestCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value.localPath && fs.existsSync(cached.value.localPath)) {
      logger.info(`Pixabay cache hit for query: "${params.q}"`);
      return cached.value;
    }
  }

  const key = getApiKey();
  const q = params.q.trim();
  if (q.length === 0) throw new Error('Pixabay search query cannot be empty');
  if (q.length > 100) throw new Error('Pixabay search query exceeds 100 characters');

  const url = 'https://pixabay.com/api/';
  const per_page = Math.min(Math.max(params.per_page ?? 20, 3), 200);

  logger.info(`Searching Pixabay for: "${q}"`);
  const response = await axios.get<PixabayResponse>(url, {
    params: {
      key,
      q,
      lang: params.lang || 'en',
      image_type: params.image_type || 'photo',
      orientation: params.orientation || 'all',
      safesearch: params.safesearch === false ? 'false' : 'true',
      per_page,
    },
    timeout: 15_000,
  });

  const hits = Array.isArray(response.data?.hits) ? response.data.hits : [];
  const best = pickBestHit(hits);
  if (!best || !best.largeImageURL) {
    throw new Error(`No suitable Pixabay image found for query: "${q}"`);
  }

  const localPath = await downloadToTemp(best.largeImageURL, best.id);
  const selected: PixabaySelectedImage = {
    id: best.id,
    pageURL: best.pageURL,
    tags: best.tags || '',
    largeImageURL: best.largeImageURL,
    imageWidth: best.imageWidth,
    imageHeight: best.imageHeight,
    localPath,
  };

  logger.info(
    `✓ Pixabay downloaded: id=${selected.id} tags="${selected.tags}" pageURL=${selected.pageURL} localPath=${selected.localPath}`
  );

  bestCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: selected });
  return selected;
}

/**
 * Search Pixabay and download the top N results (in API order, default sort=popular).
 * Returns a list of locally downloaded images.
 */
export async function fetchTopPixabayImages(
  params: PixabaySearchParams,
  count: number
): Promise<PixabaySelectedImage[]> {
  const per_page = Math.min(Math.max(params.per_page ?? 20, 3), 200);
  const requested = Math.min(Math.max(count, 1), 10);
  const cacheKey = `${normalizeQueryKey({ ...params, per_page })}|top:${requested}`;

  const cached = topCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const allExist = cached.value.every((v) => v.localPath && fs.existsSync(v.localPath));
    if (allExist) {
      logger.info(`Pixabay top-cache hit for query: "${params.q}" (n=${requested})`);
      return cached.value;
    }
  }

  const key = getApiKey();
  const q = params.q.trim();
  if (q.length === 0) throw new Error('Pixabay search query cannot be empty');
  if (q.length > 100) throw new Error('Pixabay search query exceeds 100 characters');

  const url = 'https://pixabay.com/api/';
  logger.info(`Searching Pixabay (top ${requested}) for: "${q}"`);
  const response = await axios.get<PixabayResponse>(url, {
    params: {
      key,
      q,
      lang: params.lang || 'en',
      image_type: params.image_type || 'photo',
      orientation: params.orientation || 'all',
      safesearch: params.safesearch === false ? 'false' : 'true',
      per_page,
    },
    timeout: 15_000,
  });

  const hits = Array.isArray(response.data?.hits) ? response.data.hits : [];
  const top = pickTopHitsInApiOrder(hits, requested);
  if (!top.length) {
    throw new Error(`No suitable Pixabay images found for query: "${q}"`);
  }

  const selected: PixabaySelectedImage[] = [];
  for (const h of top) {
    const localPath = await downloadToTemp(h.largeImageURL as string, h.id);
    selected.push({
      id: h.id,
      pageURL: h.pageURL,
      tags: h.tags || '',
      largeImageURL: h.largeImageURL as string,
      imageWidth: h.imageWidth,
      imageHeight: h.imageHeight,
      localPath,
    });
  }

  logger.info(`✓ Pixabay downloaded top ${selected.length} images for query="${q}"`);
  topCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: selected });
  return selected;
}


