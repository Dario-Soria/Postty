import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { getPost, deletePost } from '../services/postsStore';
import { deleteFromS3ByUrl } from '../services/s3Deleter';

interface Body {
  postId: string;
}

export default async function videoDiscardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/video/discard',
    async (request: FastifyRequest<{ Body: Body }>, reply: FastifyReply) => {
      try {
        const user = await requireUser(request);
        const { postId } = request.body || ({} as any);
        if (!postId || typeof postId !== 'string') {
          return reply.status(400).send({ status: 'error', message: 'Missing postId' });
        }

        const post = await getPost({ uid: user.uid, postId });
        if (!post) return reply.status(404).send({ status: 'error', message: 'Post not found' });
        if (post.kind !== 'video') {
          return reply.status(400).send({ status: 'error', message: 'Post is not a video' });
        }

        // Best-effort S3 delete (if mediaUrl exists).
        if (post.mediaUrl) {
          try {
            await deleteFromS3ByUrl(post.mediaUrl);
          } catch (e) {
            logger.warn('S3 delete failed (continuing):', e);
          }
        }

        await deletePost({ uid: user.uid, postId });
        return reply.status(200).send({ status: 'success' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('POST /video/discard failed:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  logger.info('✅ Video routes registered: POST /video/discard');
}


