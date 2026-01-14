import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { getPost, updatePost } from '../services/postsStore';
import { publishInstagramVideo, getInstagramPermalink } from '../services/instagramPublisher';

interface Body {
  postId: string;
}

export default async function videoPublishRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/video/publish',
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
        if (!post.mediaUrl) {
          return reply.status(400).send({ status: 'error', message: 'Video is not ready (missing mediaUrl)' });
        }
        if (post.status === 'published' && post.instagramPermalink) {
          return reply.status(200).send({ status: 'success', instagram_permalink: post.instagramPermalink });
        }

        await updatePost({ uid: user.uid, postId, patch: { status: 'publishing' as any } });

        const ig = await publishInstagramVideo({
          videoUrl: post.mediaUrl,
          caption: post.caption ?? undefined,
          kind: 'REELS',
          shareToFeed: true,
          maxPollAttempts: 180,
        });

        const permalink = await getInstagramPermalink(ig.id);

        await updatePost({
          uid: user.uid,
          postId,
          patch: {
            status: 'published',
            instagramMediaId: ig.id,
            instagramPermalink: permalink,
          },
        });

        return reply.status(200).send({ status: 'success', instagram_permalink: permalink, instagram_media_id: ig.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('POST /video/publish failed:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  logger.info('✅ Video routes registered: POST /video/publish');
}


