import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getInstagramPermalink, publishInstagramPost } from '../services/instagramPublisher';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { createPost } from '../services/postsStore';

interface PublishFromUrlRequestBody {
  image_url: string;
  caption: string;
}

/**
 * Registers the /publish-instagram-from-url route with the Fastify instance
 * This endpoint publishes a PUBLIC image URL to Instagram with a caption.
 * (No server-local paths; frontend-safe.)
 */
export default async function publishInstagramFromUrlRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/publish-instagram-from-url',
    async (
      request: FastifyRequest<{ Body: PublishFromUrlRequestBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { image_url, caption } = request.body;

        if (!image_url || typeof image_url !== 'string') {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "image_url" field',
          });
        }

        if (!caption || typeof caption !== 'string') {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "caption" field',
          });
        }

        // Basic validation: Instagram Graph API requires a publicly accessible HTTPS URL.
        if (!image_url.toLowerCase().startsWith('https://')) {
          return reply.status(400).send({
            status: 'error',
            message: '"image_url" must be a public HTTPS URL',
          });
        }

        logger.info(`Publishing Instagram post from URL: ${image_url}`);

        const instagramResponse = await publishInstagramPost(image_url, caption);
        logger.info(`✓ Instagram post published: ${instagramResponse.id}`);

        // Optional: persist to Firestore for authenticated users (so it appears in Mis posts).
        try {
          const user = await requireUser(request as any);
          let permalink: string | null = null;
          try {
            permalink = await getInstagramPermalink(instagramResponse.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.warn(`Failed to fetch Instagram permalink (${msg})`);
          }

          await createPost({
            uid: user.uid,
            kind: 'image',
            status: 'published',
            prompt: (caption || 'Instagram post').slice(0, 240),
            caption: caption,
            mediaUrl: image_url,
            previewUrl: null,
            localPath: null,
            instagramMediaId: instagramResponse.id,
            instagramPermalink: permalink,
            error: null,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          logger.warn(`Skipping Firestore createPost for published image (unauthenticated): ${msg}`);
        }

        return reply.status(200).send({
          status: 'success',
          instagram_response: instagramResponse,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error publishing Instagram post from URL:', errorMessage);

        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}


