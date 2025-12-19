import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateImage } from '../services/imageGenerator';
import { generateCaption } from '../services/captionGenerator';
import { ensureInstagramSquare1080 } from '../services/imageResizer';
import { uploadLocalImage } from '../services/imageUploader';
import { publishInstagramPost } from '../services/instagramPublisher';
import * as logger from '../utils/logger';
import { detectLanguageFromText } from '../utils/language';

interface GenerateAndPublishRequestBody {
  prompt: string;
}

/**
 * Registers the /generate-and-publish route with the Fastify instance
 * This endpoint generates an image from a text prompt, creates a caption,
 * and publishes to Instagram
 */
export default async function generateAndPublishRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/generate-and-publish',
    async (
      request: FastifyRequest<{ Body: GenerateAndPublishRequestBody }>,
      reply: FastifyReply
    ) => {
      try {
        // Validate request body
        const { prompt } = request.body;

        if (!prompt || typeof prompt !== 'string') {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "prompt" field',
          });
        }

        if (prompt.trim().length === 0) {
          return reply.status(400).send({
            status: 'error',
            message: 'Prompt cannot be empty',
          });
        }

        logger.info(`Processing AI image generation request: "${prompt}"`);

        // Step 1: Generate image from prompt
        logger.info('Step 1/5: Generating image with AI...');
        const generatedImagePath = await generateImage(prompt);
        logger.info(`✓ Image generated: ${generatedImagePath}`);

        // Step 2: Enforce Instagram 1080x1080 output
        logger.info('Step 2/5: Resizing image to Instagram 1080x1080...');
        const resizedImagePath = await ensureInstagramSquare1080(generatedImagePath);
        logger.info(`✓ Image resized: ${resizedImagePath}`);

        // Step 3: Generate Instagram caption
        logger.info('Step 3/5: Generating Instagram caption...');
        const language = detectLanguageFromText(prompt);
        const caption = await generateCaption(prompt, { forcedLanguage: language });
        logger.info(`✓ Caption generated: "${caption}"`);

        // Step 4: Upload image to S3
        logger.info('Step 4/5: Uploading image to S3...');
        const uploadedImageUrl = await uploadLocalImage(resizedImagePath);
        logger.info(`✓ Image uploaded: ${uploadedImageUrl}`);

        // Step 5: Publish to Instagram
        logger.info('Step 5/5: Publishing to Instagram...');
        const instagramResponse = await publishInstagramPost(
          uploadedImageUrl,
          caption
        );
        logger.info(`✓ Instagram post published: ${instagramResponse.id}`);

        // Return success response
        return reply.status(200).send({
          status: 'success',
          prompt: prompt,
          generated_image_path: resizedImagePath,
          caption: caption,
          uploaded_image_url: uploadedImageUrl,
          instagram_response: instagramResponse,
        });
      } catch (error) {
        // Log the error
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error processing AI image generation and publish:', errorMessage);

        // Return error response
        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}

