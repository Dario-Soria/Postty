import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Test endpoint to verify environment variables are loaded
 */
export default async function testEnvRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/test-env', async (request: FastifyRequest, reply: FastifyReply) => {
    // Never expose env surface publicly in production.
    if (process.env.NODE_ENV === 'production') {
      // Allow internal debugging when explicitly authorized.
      const tokenHeader = request.headers['x-postty-internal-token'];
      const raw =
        typeof tokenHeader === 'string'
          ? tokenHeader
          : Array.isArray(tokenHeader)
            ? tokenHeader[0]
            : '';
      const expected = process.env.POSTTY_INTERNAL_TOKEN || '';
      const allowed = expected && raw && raw === expected;
      if (!allowed) {
        return reply.status(404).send({ status: 'error', message: 'Not found' });
      }
    }

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

