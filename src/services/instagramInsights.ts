import axios from 'axios';

export type InstagramAnalytics = {
  likes?: number;
  comments?: number;
  viewsOrReach?: number;
  shares?: number;
  source?: { views: 'views' | 'reach' | 'impressions' | null };
};

type IgMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS' | string;

type IgInsightsResponse = {
  data?: Array<{
    name?: string;
    period?: string;
    values?: Array<{ value?: number | Record<string, unknown> }>;
    total_value?: { value?: number | Record<string, unknown> };
  }>;
};

function parseNumericValue(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  // Sometimes the API returns `{ value: { ... } }` for breakdowns; ignore those.
  return undefined;
}

function pickInsightValue(payload: IgInsightsResponse): number | undefined {
  const first = payload?.data?.[0];
  const total = parseNumericValue(first?.total_value?.value);
  if (typeof total === 'number') return total;
  const v0 = parseNumericValue(first?.values?.[0]?.value);
  if (typeof v0 === 'number') return v0;
  return undefined;
}

async function fetchInsightsMetric(params: {
  graphApiVersion: string;
  accessToken: string;
  mediaId: string;
  metric: string;
}): Promise<number | undefined> {
  const url = `https://graph.facebook.com/${params.graphApiVersion}/${params.mediaId}/insights`;
  const res = await axios.get<IgInsightsResponse>(url, {
    params: {
      metric: params.metric,
      access_token: params.accessToken,
    },
    timeout: 12_000,
  });
  return pickInsightValue(res?.data);
}

/**
 * Best-effort analytics for a given Instagram mediaId.
 * This is intentionally resilient: callers should treat missing fields as “not available”.
 */
export async function getInstagramAnalyticsForMediaId(mediaId: string): Promise<InstagramAnalytics> {
  const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v19.0';
  const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!INSTAGRAM_ACCESS_TOKEN) {
    return {};
  }

  let likes: number | undefined;
  let comments: number | undefined;
  let mediaType: IgMediaType | undefined;

  // Baseline: likes/comments (+ media type to choose insights metrics).
  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
    const res = await axios.get(url, {
      params: {
        fields: 'like_count,comments_count,media_type,media_product_type',
        access_token: INSTAGRAM_ACCESS_TOKEN,
      },
      timeout: 12_000,
    });

    likes = typeof res?.data?.like_count === 'number' ? res.data.like_count : undefined;
    comments = typeof res?.data?.comments_count === 'number' ? res.data.comments_count : undefined;
    mediaType = typeof res?.data?.media_type === 'string' ? (res.data.media_type as IgMediaType) : undefined;
  } catch (e) {
    // If this fails, we can still try insights, but typically permissions issues will affect both.
    const err = e instanceof Error ? e : new Error('Failed to fetch IG media basics');
    throw err;
  }

  // Insights are best-effort and vary by media type + token permissions.
  let reach: number | undefined;
  let impressions: number | undefined;
  let shares: number | undefined;
  let views: number | undefined;

  // Fetch reach/impressions first; these are the fallback for “views”.
  try {
    reach = await fetchInsightsMetric({
      graphApiVersion: GRAPH_API_VERSION,
      accessToken: INSTAGRAM_ACCESS_TOKEN,
      mediaId,
      metric: 'reach',
    });
  } catch {
    // ignore
  }

  try {
    impressions = await fetchInsightsMetric({
      graphApiVersion: GRAPH_API_VERSION,
      accessToken: INSTAGRAM_ACCESS_TOKEN,
      mediaId,
      metric: 'impressions',
    });
  } catch {
    // ignore
  }

  try {
    shares = await fetchInsightsMetric({
      graphApiVersion: GRAPH_API_VERSION,
      accessToken: INSTAGRAM_ACCESS_TOKEN,
      mediaId,
      metric: 'shares',
    });
  } catch {
    // ignore
  }

  // Views/plays differ across types; we try the most common metrics in order.
  const viewMetricCandidates =
    mediaType === 'REELS'
      ? ['plays', 'video_views']
      : mediaType === 'VIDEO'
        ? ['video_views', 'plays']
        : ['plays', 'video_views'];

  for (const metric of viewMetricCandidates) {
    try {
      const v = await fetchInsightsMetric({
        graphApiVersion: GRAPH_API_VERSION,
        accessToken: INSTAGRAM_ACCESS_TOKEN,
        mediaId,
        metric,
      });
      if (typeof v === 'number') {
        views = v;
        break;
      }
    } catch {
      // ignore and try next metric
    }
  }

  // Per your requirement: if “views” isn’t available, show reach (or impressions).
  if (typeof views === 'number') {
    return { likes, comments, shares, viewsOrReach: views, source: { views: 'views' } };
  }
  if (typeof reach === 'number') {
    return { likes, comments, shares, viewsOrReach: reach, source: { views: 'reach' } };
  }
  if (typeof impressions === 'number') {
    return { likes, comments, shares, viewsOrReach: impressions, source: { views: 'impressions' } };
  }
  return { likes, comments, shares, source: { views: null } };
}


