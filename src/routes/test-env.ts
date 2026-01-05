import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Test endpoint to verify environment variables are loaded
 */
export default async function testEnvRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/test-env', async (request: FastifyRequest, reply: FastifyReply) => {
    const envVars = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT SET',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
      AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME ? `SET (${process.env.AWS_BUCKET_NAME})` : 'NOT SET',
      AWS_REGION: process.env.AWS_REGION || 'NOT SET',
      INSTAGRAM_USER_ID: process.env.INSTAGRAM_USER_ID ? 'SET' : 'NOT SET',
      INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN ? 'SET' : 'NOT SET',
      BACKEND_URL: process.env.BACKEND_URL || 'NOT SET',
    };

    return reply.send({
      status: 'success',
      environment: envVars,
      timestamp: new Date().toISOString(),
    });
  });
}

