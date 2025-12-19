import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { analyzeInstagramImageUseCases } from '../services/geminiImageAnalyzer';

export default async function imageAnalyzerRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/image-analyzer', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ct = String((request.headers as any)?.['content-type'] || '').toLowerCase();
      if (!ct.includes('multipart/form-data')) {
        return reply.status(400).send({ status: 'error', message: 'Multipart form-data required' });
      }

      const parts = (request as any).parts?.();
      if (!parts) {
        return reply.status(400).send({ status: 'error', message: 'Multipart request expected but parts() is not available' });
      }

      let imageBuffer: Buffer | null = null;
      let filenameHint: string | null = null;
      let mimetype: string | null = null;

      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'image' || !imageBuffer) {
            imageBuffer = await part.toBuffer();
            filenameHint = part.filename || 'image.jpg';
            mimetype = part.mimetype || null;
          }
        }
      }

      if (!imageBuffer) {
        return reply.status(400).send({
          status: 'error',
          message: 'No file uploaded. Please provide an image file in the "image" field.',
        });
      }
      if (mimetype && !String(mimetype).startsWith('image/')) {
        return reply.status(400).send({ status: 'error', message: `Invalid file type: ${mimetype}` });
      }

      const result = await analyzeInstagramImageUseCases({
        imageBuffer,
        filenameHint: filenameHint || undefined,
      });

      return reply.status(200).send({ status: 'success', ...result });
    } catch (e) {
      const anyErr = e as any;
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
      const statusCode =
        typeof anyErr?.statusCode === 'number'
          ? anyErr.statusCode
          : typeof anyErr?.status === 'number'
            ? anyErr.status
            : typeof anyErr?.error?.code === 'number'
              ? anyErr.error.code
              : null;

      if (code === 'FST_REQ_FILE_TOO_LARGE' || msg.toLowerCase().includes('file too large')) {
        return reply.status(413).send({
          status: 'error',
          message:
            'Image too large. Please upload a smaller file (try exporting JPG) or increase POSTTY_FILE_LIMIT_BYTES.',
        });
      }

      if (statusCode === 429) {
        return reply.status(429).send({
          status: 'error',
          message: msg || 'Gemini is temporarily rate-limited. Please retry in a moment.',
        });
      }

      logger.error('Error in /image-analyzer:', msg);
      return reply.status(500).send({ status: 'error', message: msg });
    }
  });
}


