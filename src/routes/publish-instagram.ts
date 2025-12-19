import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { uploadLocalImage } from '../services/imageUploader';
import { publishInstagramPost } from '../services/instagramPublisher';
import * as logger from '../utils/logger';

interface PublishRequestBody {
  image_path: string;
  caption: string;
}

/**
 * Registers the /publish-instagram route with the Fastify instance
 */
export default async function publishInstagramRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/publish-instagram',
    async (
      request: FastifyRequest<{ Body: PublishRequestBody }>,
      reply: FastifyReply
    ) => {
      try {
        // Validate request body
        const { image_path, caption } = request.body;

        if (!image_path || typeof image_path !== 'string') {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "image_path" field',
          });
        }

        if (!caption || typeof caption !== 'string') {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "caption" field',
          });
        }

        // Validate that the file exists
        const resolved = path.resolve(image_path);
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
            message: 'Invalid "image_path" (must be under generated-images/ or temp-uploads/)',
          });
        }

        if (!fs.existsSync(resolved)) {
          return reply.status(400).send({
            status: 'error',
            message: `File does not exist: ${resolved}`,
          });
        }

        logger.info(`Processing Instagram post request for: ${resolved}`);

        // Step 1: Upload image to S3
        const uploadedImageUrl = await uploadLocalImage(resolved);
        logger.info(`Image uploaded successfully: ${uploadedImageUrl}`);

        // Step 2: Publish to Instagram
        const instagramResponse = await publishInstagramPost(
          uploadedImageUrl,
          caption
        );
        logger.info(`Instagram post published: ${instagramResponse.id}`);

        // Best-effort cleanup: remove the local file after publish so disk doesn't grow unbounded.
        try {
          fs.unlinkSync(resolved);
          logger.info(`✓ Cleaned up local image after publish: ${resolved}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          logger.warn(`Failed to cleanup local image after publish (${msg}): ${resolved}`);
        }

        // Return success response
        return reply.status(200).send({
          status: 'success',
          uploaded_image_url: uploadedImageUrl,
          instagram_response: instagramResponse,
        });
      } catch (error) {
        // Log the error
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error processing Instagram post:', errorMessage);

        // Return error response
        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}

