import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeImageWithVision } from '../services/imageAnalyzer';
import { generateImageWithContext, generateImageWithReferenceImages } from '../services/imageGenerator';
import { generateCaption } from '../services/captionGenerator';
import { ensureInstagramSquare1080 } from '../services/imageResizer';
import { uploadLocalImage } from '../services/imageUploader';
import { publishInstagramPost } from '../services/instagramPublisher';
import * as logger from '../utils/logger';
import { detectLanguageFromText } from '../utils/language';

/**
 * Registers the /generate-with-image-and-publish route with the Fastify instance
 * This endpoint accepts an uploaded image and text prompt, analyzes the image with GPT-4 Vision,
 * generates a new AI image incorporating visual context, and publishes to Instagram
 */
export default async function generateWithImageAndPublishRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/generate-with-image-and-publish',
    async (request: FastifyRequest, reply: FastifyReply) => {
      let tempImagePath: string | null = null;

      try {
        // Parse multipart form data
        const parts = request.parts();
        let imageBuffer: Buffer | null = null;
        let imageFilename: string | null = null;
        let imageMimetype: string | null = null;
        let prompt: string | null = null;

        // Iterate through all parts to get both file and text fields
        for await (const part of parts) {
          if (part.type === 'file') {
            // Read the file buffer immediately
            imageBuffer = await part.toBuffer();
            imageFilename = part.filename;
            imageMimetype = part.mimetype;
          } else {
            // part.type === 'field'
            if (part.fieldname === 'prompt') {
              prompt = part.value as string;
            }
          }
        }

        if (!imageBuffer || !imageFilename || !imageMimetype) {
          return reply.status(400).send({
            status: 'error',
            message: 'No file uploaded. Please provide an image file in the "image" field.',
          });
        }

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          return reply.status(400).send({
            status: 'error',
            message: 'Missing or invalid "prompt" field. Please provide a text prompt.',
          });
        }

        // Validate file is an image
        if (!imageMimetype.startsWith('image/')) {
          return reply.status(400).send({
            status: 'error',
            message: `Invalid file type: ${imageMimetype}. Please upload an image file (JPEG, PNG, etc.).`,
          });
        }

        logger.info(`Processing image + prompt request: "${prompt}"`);
        logger.info(`Uploaded file: ${imageFilename}, type: ${imageMimetype}`);

        // Ensure temp-uploads directory exists
        const tempDir = path.join(process.cwd(), 'temp-uploads');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Save uploaded file to temporary location
        const timestamp = Date.now();
        const extension = imageFilename.split('.').pop() || 'jpg';
        const tempFilename = `${timestamp}_upload.${extension}`;
        tempImagePath = path.join(tempDir, tempFilename);

        // Write the uploaded file
        fs.writeFileSync(tempImagePath, imageBuffer);
        logger.info(`✓ Uploaded image saved temporarily: ${tempImagePath}`);

        // Step 1: Analyze the uploaded image with GPT-4 Vision
        logger.info('Step 1/5: Analyzing uploaded image with GPT-4 Vision...');
        const imageAnalysis = await analyzeImageWithVision(tempImagePath);
        logger.info(`✓ Image analysis: "${imageAnalysis.substring(0, 100)}..."`);

        // Step 2: Generate new image with context
        logger.info('Step 2/6: Generating AI image with visual context...');
        let generatedImagePath: string;
        let usedReferenceEdit = false;
        try {
          const enhancedPrompt = `${prompt}\n\nIncorporate these visual elements from the reference image: ${imageAnalysis}`;
          generatedImagePath = await generateImageWithReferenceImages({
            prompt: enhancedPrompt,
            imagePaths: [tempImagePath],
            input_fidelity: 'high',
            quality: 'high',
            size: '1024x1024',
          });
          usedReferenceEdit = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          logger.warn(`OpenAI reference-image edit failed (${msg}); falling back to generateImageWithContext.`);
          generatedImagePath = await generateImageWithContext(prompt, imageAnalysis);
        }
        logger.info(`✓ Image generated: ${generatedImagePath}`);

        // Step 3: Enforce Instagram 1080x1080 output
        logger.info('Step 3/6: Resizing image to Instagram 1080x1080...');
        const resizedImagePath = await ensureInstagramSquare1080(generatedImagePath);
        logger.info(`✓ Image resized: ${resizedImagePath}`);

        // Step 4: Generate Instagram caption
        logger.info('Step 4/6: Generating Instagram caption...');
        const language = detectLanguageFromText(prompt);
        const caption = await generateCaption(prompt, { forcedLanguage: language });
        logger.info(`✓ Caption generated: "${caption}"`);

        // Step 5: Upload generated image to S3
        logger.info('Step 5/6: Uploading image to S3...');
        const uploadedImageUrl = await uploadLocalImage(resizedImagePath);
        logger.info(`✓ Image uploaded: ${uploadedImageUrl}`);

        // Step 6: Publish to Instagram
        logger.info('Step 6/6: Publishing to Instagram...');
        const instagramResponse = await publishInstagramPost(
          uploadedImageUrl,
          caption
        );
        logger.info(`✓ Instagram post published: ${instagramResponse.id}`);

        // Clean up: delete temporary uploaded file
        if (tempImagePath && fs.existsSync(tempImagePath)) {
          fs.unlinkSync(tempImagePath);
          logger.info('✓ Temporary file cleaned up');
        }

        // Construct enhanced prompt for response
        const enhancedPrompt = `${prompt}\n\nIncorporate these visual elements from the reference image: ${imageAnalysis}`;

        // Return success response
        return reply.status(200).send({
          status: 'success',
          prompt: prompt,
          uploaded_image_analysis: imageAnalysis,
          enhanced_prompt: enhancedPrompt,
          generated_image_path: resizedImagePath,
          caption: caption,
          uploaded_image_url: uploadedImageUrl,
          instagram_response: instagramResponse,
          used_reference_image_edit: usedReferenceEdit,
        });
      } catch (error) {
        // Clean up temporary file on error
        if (tempImagePath && fs.existsSync(tempImagePath)) {
          try {
            fs.unlinkSync(tempImagePath);
            logger.info('Temporary file cleaned up after error');
          } catch (cleanupError) {
            logger.error('Failed to clean up temporary file:', cleanupError);
          }
        }

        // Log the error
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('Error processing image + prompt generation and publish:', errorMessage);

        // Return error response
        return reply.status(500).send({
          status: 'error',
          message: errorMessage,
        });
      }
    }
  );
}

