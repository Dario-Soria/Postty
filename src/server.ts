import path from 'path';
import dotenv from 'dotenv';
// Load environment variables in a robust way for dev/prod.
// 1) Default dotenv behavior (uses process.cwd()).
dotenv.config();
// 2) Explicitly attempt to load the project-root .env even when launched from dist/ or elsewhere.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
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
import agentChatRoute from './routes/agent-chat';
import serveGeneratedImageRoute from './routes/serve-generated-image';
import serveReferenceImageRoute from './routes/serve-reference-image';
import searchReferencesRoute from './routes/search-references';
import testEnvRoute from './routes/test-env';
import applyReferenceJsonRoute from './routes/applyReferenceJson';
import applyDesignGuidelinesTextRoute from './routes/applyDesignGuidelinesText';
import incrementReferenceRankingRoute from './routes/increment-reference-ranking';
import publishInstagramVideoRoute from './routes/publish-instagram-video';
import videoGenerateAndPublishRoutes from './routes/video-generate-and-publish';
import videoJobRoutes from './routes/video-jobs';
import videoGenerateRoutes from './routes/video-generate';
import videoPublishRoutes from './routes/video-publish';
import videoDiscardRoutes from './routes/video-discard';
import postsRoutes from './routes/posts';
import postsAnalyticsRoutes from './routes/posts-analytics';
import instagramAuthRoutes from './routes/instagram-auth';
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
    // Dev convenience: allow internal agent calls (used by Product Showcase agent -> /video/generate)
    // without forcing local developers to configure a secret.
    if (
      (!process.env.POSTTY_INTERNAL_TOKEN || process.env.POSTTY_INTERNAL_TOKEN.trim().length === 0) &&
      process.env.NODE_ENV !== 'production'
    ) {
      process.env.POSTTY_INTERNAL_TOKEN = 'postty-dev-internal-token';
      logger.warn('[Config] POSTTY_INTERNAL_TOKEN not set; using development default token');
    }

    // Debug signal (safe): shows whether Meta OAuth vars are visible to the running process.
    // This helps diagnose “I set it in .env but server can’t see it”.
    const metaAppId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
    const metaAppSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
    logger.info(
      `[Config] Meta OAuth env present: META_APP_ID=${!!metaAppId}, META_APP_SECRET=${!!metaAppSecret}, META_REDIRECT_URI=${!!process.env.META_REDIRECT_URI}, POSTTY_IG_OAUTH_STATE_SECRET=${!!process.env.POSTTY_IG_OAUTH_STATE_SECRET}`
    );

    // Accept application/x-www-form-urlencoded requests (used by some clients/tools).
    // We parse it ourselves to avoid adding extra dependencies.
    fastify.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (req, body, done) => {
        try {
          const parsed = Object.fromEntries(new URLSearchParams(body as string).entries());
          done(null, parsed);
        } catch (e) {
          done(e as Error);
        }
      }
    );

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
    await fastify.register(publishInstagramVideoRoute);
    await fastify.register(videoGenerateAndPublishRoutes);
    await fastify.register(videoJobRoutes);
    await fastify.register(videoGenerateRoutes);
    await fastify.register(videoPublishRoutes);
    await fastify.register(videoDiscardRoutes);
    await fastify.register(postsRoutes);
    await fastify.register(postsAnalyticsRoutes);
    await fastify.register(instagramAuthRoutes);
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
    await fastify.register(agentChatRoute);
    await fastify.register(serveGeneratedImageRoute);
    await fastify.register(serveReferenceImageRoute);
    await fastify.register(searchReferencesRoute);
    await fastify.register(applyReferenceJsonRoute);
    await fastify.register(applyDesignGuidelinesTextRoute);
    await fastify.register(incrementReferenceRankingRoute);
    await fastify.register(testEnvRoute);

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
    logger.info('  POST /publish-instagram-video - Publish a server-local mp4 video to Instagram (uploads to S3 first; uses REELS)');
    logger.info('  POST /video/generate-and-publish - Generate a Veo video (optional product image), upload to S3, publish to IG (async job)');
    logger.info('  GET  /video/jobs/:jobId - Check status for Veo video generation/publish job');
    logger.info('  POST /video/generate - Generate Veo video and save as ready_to_upload (manual publish flow; Firestore-backed)');
    logger.info('  POST /video/publish - Publish a ready video to Instagram (manual publish flow; Firestore-backed)');
    logger.info('  POST /video/discard - Discard a ready video and delete from storage (manual flow; Firestore-backed)');
    logger.info('  GET  /posts - List user posts/videos (Firestore-backed)');
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
    logger.info('  POST /search-references - Search indexed reference images by query');
    logger.info('  POST /apply-reference-json - Apply reference JSON text to base image');
    logger.info('  POST /apply-design-guidelines-text - Apply text using SQLite design guidelines');
    logger.info('  GET  /reference-library/images/* - Serve reference library images');
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

