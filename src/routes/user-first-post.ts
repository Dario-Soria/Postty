import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { getFirestore } from '../services/firebaseAdmin';
import { requireAuthorizedUser } from '../services/firebaseAuth';

/**
 * Endpoint to check if this is the user's first post
 * Returns { isFirstPost: boolean }
 * 
 * V2: Now checks a flag in the user document instead of counting posts.
 * This works because posts are only saved when published, not when generated.
 */
export default async function userFirstPostRoute(fastify: FastifyInstance): Promise<void> {
  
  // GET /user/is-first-post - Check if user has generated their first post
  fastify.get('/user/is-first-post', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await requireAuthorizedUser(request as any);
      const uid = user.uid;

      // V2: Check flag in user document instead of counting posts
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(uid).get();
      const hasGeneratedPost = userDoc.exists && userDoc.data()?.hasGeneratedPost === true;
      const isFirstPost = !hasGeneratedPost;

      logger.info(`[UserFirstPost] User ${uid.substring(0, 8)}... hasGeneratedPost: ${hasGeneratedPost}, isFirstPost: ${isFirstPost}`);

      return reply.send({
        status: 'success',
        isFirstPost,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[UserFirstPost] Error:', errorMsg);
      const lower = errorMsg.toLowerCase();
      const status = lower.includes('authorization') || lower.includes('invalid authentication') ? 401 : lower.includes('access not granted') ? 403 : 500;
      return reply.status(status).send({
        status: 'error',
        message: status === 500 ? 'Error checking first post status' : errorMsg,
      });
    }
  });

  // POST /user/mark-first-post - Mark that user has generated their first post
  fastify.post('/user/mark-first-post', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await requireAuthorizedUser(request as any);
      const uid = user.uid;

      // Update user document to mark first post as generated
      const db = getFirestore();
      await db.collection('users').doc(uid).set(
        { hasGeneratedPost: true },
        { merge: true }
      );

      logger.info(`[UserFirstPost] User ${uid.substring(0, 8)}... marked hasGeneratedPost: true`);

      return reply.send({
        status: 'success',
        message: 'First post marked',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[UserFirstPost] Error marking first post:', errorMsg);
      const lower = errorMsg.toLowerCase();
      const status = lower.includes('authorization') || lower.includes('invalid authentication') ? 401 : lower.includes('access not granted') ? 403 : 500;
      return reply.status(status).send({
        status: 'error',
        message: status === 500 ? 'Error marking first post' : errorMsg,
      });
    }
  });

  logger.info('✅ User first post routes registered: GET /user/is-first-post, POST /user/mark-first-post');
}
