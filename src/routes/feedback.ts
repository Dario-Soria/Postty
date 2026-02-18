import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { insertFeedbackEntry } from '../services/feedbackStore';

type FeedbackBody = {
  rating1?: unknown;
  rating2?: unknown;
  comment?: unknown;
};

function toRatingInt(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return Math.trunc(x);
  if (typeof x === 'string' && x.trim()) {
    const n = Number.parseInt(x.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default async function feedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/feedback',
    async (request: FastifyRequest<{ Body: FeedbackBody }>, reply: FastifyReply) => {
      try {
        const user = await requireUser(request);
        const r1 = toRatingInt(request.body?.rating1);
        const r2 = toRatingInt(request.body?.rating2);
        const comment = typeof request.body?.comment === 'string' ? request.body.comment : '';

        if (!r1 || r1 < 1 || r1 > 5 || !r2 || r2 < 1 || r2 > 5) {
          return reply.status(400).send({
            status: 'error',
            message: 'Invalid body: expected { rating1: 1..5, rating2: 1..5, comment?: string }',
          });
        }

        const inserted = await insertFeedbackEntry({
          uid: user.uid,
          email: user.email ?? null,
          name: user.name ?? null,
          easeOfUseRating: r1,
          resultQualityRating: r2,
          comment,
        });

        return reply.status(200).send({ status: 'success', id: inserted.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('POST /feedback failed:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  logger.info('✅ Feedback routes registered: POST /feedback');
}

