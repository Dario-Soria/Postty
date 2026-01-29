import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { listPosts } from '../services/postsStore';
import { getFirebaseAdmin } from '../services/firebaseAdmin';

/**
 * Endpoint to check if this is the user's first post
 * Returns { isFirstPost: boolean }
 */
export default async function userFirstPostRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/user/is-first-post', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          status: 'error',
          message: 'Missing or invalid Authorization header',
        });
      }

      const idToken = authHeader.slice(7); // Remove "Bearer "

      // Verify Firebase ID token
      const admin = getFirebaseAdmin();
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        logger.error('[UserFirstPost] Invalid token:', err);
        return reply.status(401).send({
          status: 'error',
          message: 'Invalid or expired token',
        });
      }

      const uid = decodedToken.uid;

      // Check if user has any posts
      const posts = await listPosts({ uid, limit: 1 });
      const isFirstPost = posts.length === 0;

      logger.info(`[UserFirstPost] User ${uid.substring(0, 8)}... isFirstPost: ${isFirstPost}`);

      return reply.send({
        status: 'success',
        isFirstPost,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[UserFirstPost] Error:', errorMsg);
      return reply.status(500).send({
        status: 'error',
        message: 'Error checking first post status',
      });
    }
  });

  logger.info('✅ User first post route registered: GET /user/is-first-post');
}
