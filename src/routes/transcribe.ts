import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import OpenAI, { toFile } from 'openai';
import * as logger from '../utils/logger';

function initOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');
  return new OpenAI({ apiKey });
}

/**
 * Registers the /transcribe route with the Fastify instance
 * Accepts multipart form upload: field "audio" (file)
 */
export default async function transcribeRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/transcribe',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const parts = request.parts();
        let audioBuffer: Buffer | null = null;
        let audioFilename: string | null = null;
        let audioMimetype: string | null = null;

        const MAX_BYTES = parseInt(process.env.TRANSCRIBE_MAX_BYTES || '10485760', 10); // 10MB

        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'audio') {
            audioFilename = part.filename || 'audio.webm';
            audioMimetype = part.mimetype || 'application/octet-stream';
            audioBuffer = await part.toBuffer();

            if (audioBuffer.length > MAX_BYTES) {
              return reply.status(413).send({
                status: 'error',
                message: `Audio file too large. Max ${MAX_BYTES} bytes.`,
              });
            }
          }
        }

        if (!audioBuffer) {
          return reply.status(400).send({
            status: 'error',
            message: 'No audio uploaded. Please provide a file field named "audio".',
          });
        }

        const openai = initOpenAIClient();
        const model = (process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1').trim();

        logger.info(`Transcribing audio (${audioFilename}, ${audioMimetype}, ${audioBuffer.length} bytes)`);

        const file = await toFile(audioBuffer, audioFilename ?? 'audio.webm', {
          type: audioMimetype ?? 'application/octet-stream',
        });

        const resp = await openai.audio.transcriptions.create({
          file,
          model,
        });

        const text = typeof resp.text === 'string' ? resp.text.trim() : '';
        if (!text) {
          return reply.status(200).send({
            status: 'success',
            text: '',
          });
        }

        return reply.status(200).send({
          status: 'success',
          text,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error transcribing audio:', errorMessage);
        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}


