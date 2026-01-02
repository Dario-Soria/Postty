import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as logger from '../utils/logger';

interface ImageParams {
  filename: string;
}

export default async function serveGeneratedImageRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: ImageParams }>(
    '/generated-images/:filename',
    async (request: FastifyRequest<{ Params: ImageParams }>, reply: FastifyReply) => {
      try {
        const { filename } = request.params;

        // Security: only allow safe filenames (alphanumeric, dash, underscore, .png)
        if (!/^[\w\-\.]+\.png$/i.test(filename)) {
          return reply.status(400).send({
            status: 'error',
            message: 'Invalid filename',
          });
        }

        // Path to generated images folder
        const imagePath = path.join(process.cwd(), 'generated-images', filename);

        // Check if file exists
        try {
          await fs.access(imagePath);
        } catch {
          return reply.status(404).send({
            status: 'error',
            message: 'Image not found',
          });
        }

        // Read and send the image
        const imageBuffer = await fs.readFile(imagePath);

        return reply
          .type('image/png')
          .header('Cache-Control', 'public, max-age=31536000, immutable')
          .send(imageBuffer);
      } catch (error) {
        logger.error('Error serving generated image:', error);
        return reply.status(500).send({
          status: 'error',
          message: 'Failed to serve image',
        });
      }
    }
  );

  logger.info('✅ Serve generated images route registered: GET /generated-images/:filename');
}

