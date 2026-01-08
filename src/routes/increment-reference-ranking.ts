import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { incrementReferenceRanking } from '../services/referenceLibrarySqlite';
import * as logger from '../utils/logger';

interface IncrementRankingBody {
  referenceFilename: string;
}

export default async function incrementReferenceRankingRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/increment-reference-ranking', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as IncrementRankingBody;
      const { referenceFilename } = body;
      
      if (!referenceFilename) {
        return reply.status(400).send({ 
          status: 'error', 
          message: 'Missing referenceFilename' 
        });
      }
      
      logger.info(`[Ranking] Incrementing ranking for: ${referenceFilename}`);
      incrementReferenceRanking(referenceFilename);
      
      return reply.send({ status: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Ranking] Error: ${msg}`);
      return reply.status(500).send({ 
        status: 'error', 
        message: msg
      });
    }
  });

  logger.info('✅ Increment reference ranking route registered: POST /increment-reference-ranking');
}

