import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { getInstagramAnalyticsForMediaId, type InstagramAnalytics } from '../services/instagramInsights';

type PostsAnalyticsBody = {
  mediaIds?: unknown;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  const worker = async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current]!);
    }
  };

  const workers = new Array(Math.max(1, Math.min(concurrency, items.length)))
    .fill(0)
    .map(() => worker());
  await Promise.all(workers);
  return results;
}

export default async function postsAnalyticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/posts/analytics',
    async (
      request: FastifyRequest<{ Body: PostsAnalyticsBody }>,
      reply: FastifyReply
    ) => {
      try {
        await requireUser(request);

        const rawIds = request.body?.mediaIds;
        if (!Array.isArray(rawIds)) {
          return reply.status(400).send({
            status: 'error',
            message: 'Invalid body: expected { mediaIds: string[] }',
          });
        }

        const mediaIds = rawIds.filter(isNonEmptyString).map((s) => s.trim());
        const deduped = Array.from(new Set(mediaIds)).slice(0, 60);

        const pairs = await mapWithConcurrency(deduped, 6, async (mediaId) => {
          try {
            const analytics = await getInstagramAnalyticsForMediaId(mediaId);
            return [mediaId, analytics] as const;
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`IG analytics failed for mediaId=${mediaId}: ${msg}`);
            return [mediaId, {} as InstagramAnalytics] as const;
          }
        });

        const analyticsByMediaId = Object.fromEntries(pairs) as Record<string, InstagramAnalytics>;
        return reply.status(200).send({ status: 'success', analyticsByMediaId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('POST /posts/analytics failed:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  logger.info('✅ Posts analytics routes registered: POST /posts/analytics');
}


