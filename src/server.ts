import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import publishInstagramRoute from './routes/publish-instagram';
import generateAndPublishRoute from './routes/generate-and-publish';
import generateWithImageAndPublishRoute from './routes/generate-with-image-and-publish';
import generateOnlyRoute from './routes/generate-only';
import generateWithImageOnlyRoute from './routes/generate-with-image-only';
import publishInstagramFromUrlRoute from './routes/publish-instagram-from-url';
import chatRoute from './routes/chat';
import posttyArchitectRoute from './routes/postty-architect';
import captionRoute from './routes/caption';
import transcribeRoute from './routes/transcribe';
import v2GenerateRoutes from './routes/v2-generate';
import styleProfileRoute from './routes/style-profile';
import imageAnalyzerRoute from './routes/image-analyzer';
import pipelineRoute from './routes/pipeline';
import suggestTextRoute from './routes/suggestText';
import geminiChatRoute from './routes/geminiChat';
import templateRoutes from './routes/templates';
import productAgentRoutes from './routes/productAgent';
import * as logger from './utils/logger';

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';
const BODY_LIMIT_BYTES = parseInt(process.env.POSTTY_BODY_LIMIT_BYTES || '31457280', 10); // 30MB
const FILE_LIMIT_BYTES = parseInt(process.env.POSTTY_FILE_LIMIT_BYTES || '26214400', 10); // 25MB per file

// Create Fastify instance
const fastify = Fastify({
  logger: false, // We use our custom logger
  bodyLimit: BODY_LIMIT_BYTES,
});

/**
 * Initialize and start the server
 */
async function start(): Promise<void> {
  try {
    // Register plugins
    await fastify.register(multipart, {
      limits: {
        fileSize: FILE_LIMIT_BYTES,
        files: 25,
      },
      throwFileSizeLimit: true,
    });

    // Register routes
    await fastify.register(publishInstagramRoute);
    await fastify.register(generateAndPublishRoute);
    await fastify.register(generateWithImageAndPublishRoute);
    await fastify.register(generateOnlyRoute);
    await fastify.register(generateWithImageOnlyRoute);
    await fastify.register(publishInstagramFromUrlRoute);
    await fastify.register(chatRoute);
    await fastify.register(posttyArchitectRoute);
    await fastify.register(captionRoute);
    await fastify.register(transcribeRoute);
    await fastify.register(v2GenerateRoutes);
    await fastify.register(styleProfileRoute);
    await fastify.register(imageAnalyzerRoute);
    await fastify.register(pipelineRoute);
    await fastify.register(suggestTextRoute);
    await fastify.register(geminiChatRoute);
    await fastify.register(templateRoutes);
    await fastify.register(productAgentRoutes);

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Start server
    await fastify.listen({ port: PORT, host: HOST });
    logger.info(`Server listening on http://${HOST}:${PORT}`);
    logger.info('Available routes:');
    logger.info('  POST /publish-instagram - Publish image to Instagram');
    logger.info('  POST /generate-and-publish - Generate AI image and publish to Instagram');
    logger.info('  POST /generate-with-image-and-publish - Generate AI image from uploaded image + prompt and publish');
    logger.info('  POST /generate - Generate AI image + caption + S3 upload (no publish)');
    logger.info('  POST /generate-with-image - Generate AI image from uploaded image + prompt (no publish)');
    logger.info('  POST /publish-instagram-from-url - Publish a public image URL to Instagram');
    logger.info('  POST /chat - Conversational orchestrator (guardrails + slot-filling)');
    logger.info('  POST /postty-architect - Content Architect (V10 states + options + refining)');
    logger.info('  POST /caption - Caption-only regeneration');
    logger.info('  POST /transcribe - Speech-to-text (upload audio file field: "audio")');
    logger.info('  POST /v2/generate - V2 Gemini-only text-to-image');
    logger.info('  POST /v2/generate-with-image - V2 Gemini background + local true-pixel product merge');
    logger.info('  POST /v2/generate-with-references - V2 product merge using uploaded reference backgrounds + async indexing');
    logger.info('  POST /style-profile - Extract strict style profile from reference images (async SQLite indexing)');
    logger.info('  POST /image-analyzer - Gemini vision image analysis for use-case selection');
    logger.info('  POST /pipeline - Full image generation pipeline (Nano Banana + Gemini text + compositor)');
    logger.info('  POST /pipeline/json - Pipeline with JSON body (base64 images)');
    logger.info('  GET  /pipeline/status - Check pipeline readiness');
    logger.info('  GET  /pipeline/references - List available reference images');
    logger.info('  GET  /health - Health check');
  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await fastify.close();
    logger.info('Server closed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the server
start();

