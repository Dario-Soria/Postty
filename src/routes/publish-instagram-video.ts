import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { uploadLocalImage } from '../services/imageUploader';
import { publishInstagramVideo } from '../services/instagramPublisher';

interface PublishVideoRequestBody {
  video_path: string;
  caption?: string;
}

/**
 * Registers the /publish-instagram-video route with the Fastify instance
 * This endpoint publishes a SERVER-LOCAL mp4 to Instagram (upload to S3 first).
 * Hardcoded to REELS for now (VIDEO media_type is deprecated by Meta).
 */
export default async function publishInstagramVideoRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/publish-instagram-video',
    async (
      request: FastifyRequest<{ Body: PublishVideoRequestBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { video_path, caption } = request.body;

        if (!video_path || typeof video_path !== 'string') {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "video_path" field',
          });
        }

        // Validate that the file exists and is in an allowed directory
        const resolved = path.resolve(video_path);
        const allowedDirs = [
          path.join(process.cwd(), 'generated-images'),
          path.join(process.cwd(), 'temp-uploads'),
        ];
        const isAllowed = allowedDirs.some((d) => {
          const dir = path.resolve(d);
          return resolved === dir || resolved.startsWith(dir + path.sep);
        });

        if (!isAllowed) {
          return reply.status(400).send({
            status: 'error',
            message:
              'Invalid "video_path" (must be under generated-images/ or temp-uploads/)',
          });
        }

        if (!/\.mp4$/i.test(resolved)) {
          return reply.status(400).send({
            status: 'error',
            message: 'Invalid "video_path" (only .mp4 is supported for now)',
          });
        }

        if (!fs.existsSync(resolved)) {
          return reply.status(400).send({
            status: 'error',
            message: `File does not exist: ${resolved}`,
          });
        }

        logger.info(`Processing Instagram video publish request for: ${resolved}`);

        // Step 1: Upload video to S3 (must be public HTTPS URL)
        logger.info('Uploading video to S3...');
        const uploadedVideoUrl = await uploadLocalImage(resolved);
        logger.info(`Video uploaded successfully: ${uploadedVideoUrl}`);

        // Step 2: Publish to Instagram (hardcoded reels)
        // Meta deprecated media_type=VIDEO; use REELS to publish video to feed.
        logger.info('Publishing video to Instagram (media_type=REELS)...');
        const instagramResponse = await publishInstagramVideo({
          videoUrl: uploadedVideoUrl,
          caption: typeof caption === 'string' ? caption : undefined,
          kind: 'REELS',
          shareToFeed: true,
          // Video processing can take longer than images; allow more polling.
          maxPollAttempts: 180, // 180 * 2s = 6 minutes max
        });

        logger.info(`✓ Instagram video published: ${instagramResponse.id}`);

        return reply.status(200).send({
          status: 'success',
          uploaded_video_url: uploadedVideoUrl,
          instagram_response: instagramResponse,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error publishing Instagram video:', errorMessage);

        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}


