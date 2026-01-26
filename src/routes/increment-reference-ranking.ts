import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { incrementReferenceRanking } from '../services/referenceLibrarySqlite';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';

interface IncrementRankingBody {
  referenceId?: string;
  referenceFilename?: string; // backwards compatibility (treated as id)
}

export default async function incrementReferenceRankingRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/increment-reference-ranking', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await requireUser(request as any);
      const body = request.body as IncrementRankingBody;
      const referenceId =
        typeof body.referenceId === 'string'
          ? body.referenceId
          : typeof body.referenceFilename === 'string'
            ? body.referenceFilename
            : '';
      
      if (!referenceId || referenceId.trim().length === 0) {
        return reply.status(400).send({ 
          status: 'error', 
          message: 'Missing referenceId' 
        });
      }
      
      logger.info(`[Ranking] Incrementing ranking for: ${referenceId}`);
      await incrementReferenceRanking({ uid: user.uid, referenceId: referenceId.trim() });
      
      return reply.send({ status: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Ranking] Error: ${msg}`);
      const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
      return reply.status(status).send({ status: 'error', message: msg });
    }
  });

  logger.info('✅ Increment reference ranking route registered: POST /increment-reference-ranking');
}

