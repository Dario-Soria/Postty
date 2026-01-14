import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { listPosts } from '../services/postsStore';

export default async function postsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/posts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await requireUser(request);
      const limitRaw = (request.query as any)?.limit;
      const limit = typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : undefined;
      const posts = await listPosts({ uid: user.uid, limit });
      return reply.status(200).send({ status: 'success', posts });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      logger.error('GET /posts failed:', msg);
      const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
      return reply.status(status).send({ status: 'error', message: msg });
    }
  });

  logger.info('✅ Posts routes registered: GET /posts');
}


