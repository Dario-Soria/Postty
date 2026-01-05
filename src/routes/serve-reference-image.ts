import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as logger from '../utils/logger';

interface ImageParams {
  '*': string;
}

export default async function serveReferenceImageRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: ImageParams }>(
    '/reference-library/images/*',
    async (request: FastifyRequest<{ Params: ImageParams }>, reply: FastifyReply) => {
      try {
        const filename = request.params['*'];
        logger.info(`[Reference Image] Requested: ${filename}`);

        // Security: only allow safe filenames (alphanumeric, dash, underscore, dot, common image extensions)
        if (!/^[\w\-\.]+\.(png|jpg|jpeg|webp|gif)$/i.test(filename)) {
          logger.warn(`[Reference Image] Invalid filename format: ${filename}`);
          return reply.status(400).send({
            status: 'error',
            message: 'Invalid filename',
          });
        }

        // Path to reference library images folder
        const imagePath = path.join(process.cwd(), 'reference-library', 'images', filename);
        logger.info(`[Reference Image] Full path: ${imagePath}`);

        // Check if file exists
        try {
          await fs.access(imagePath);
          logger.info(`[Reference Image] File found: ${filename}`);
        } catch (error) {
          logger.error(`[Reference Image] File not found: ${imagePath}`, error);
          return reply.status(404).send({
            status: 'error',
            message: 'Image not found',
          });
        }

        // Read and send the image
        const imageBuffer = await fs.readFile(imagePath);

        // Determine mime type from extension
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'image/jpeg'; // default
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.gif') mimeType = 'image/gif';

        return reply
          .type(mimeType)
          .header('Cache-Control', 'public, max-age=31536000, immutable')
          .send(imageBuffer);
      } catch (error) {
        logger.error('Error serving reference image:', error);
        return reply.status(500).send({
          status: 'error',
          message: 'Failed to serve image',
        });
      }
    }
  );

  logger.info('✅ Serve reference images route registered: GET /reference-library/images/*');
}

