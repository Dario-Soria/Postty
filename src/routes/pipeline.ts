/**
 * Pipeline Route
 * HTTP endpoint for the complete image generation pipeline
 * 
 * POST /pipeline - Execute full pipeline
 * GET /pipeline/status - Check pipeline readiness
 * GET /pipeline/references - List available reference images
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import {
  executePipeline,
  isPipelineReady,
  getAvailableReferences,
  type PipelineInput,
  type PipelineOutput,
} from '../services/pipelineOrchestrator';

// Temp uploads directory for multipart files
function getTempUploadDir(): string {
  const dir = path.join(process.cwd(), 'temp-uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Register pipeline routes
 */
export default async function pipelineRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /pipeline/status
   * Check if the pipeline is ready to execute
   */
  fastify.get('/pipeline/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = isPipelineReady();
      return reply.send({
        success: true,
        ...status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Pipeline status check failed:', errorMsg);
      return reply.status(500).send({
        success: false,
        error: errorMsg,
      });
    }
  });

  /**
   * GET /pipeline/references
   * List available reference images
   */
  fastify.get('/pipeline/references', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const references = getAvailableReferences();
      return reply.send({
        success: true,
        count: references.length,
        references,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list references:', errorMsg);
      return reply.status(500).send({
        success: false,
        error: errorMsg,
      });
    }
  });

  /**
   * POST /pipeline
   * Execute the complete image generation pipeline
   * 
   * Accepts multipart/form-data with:
   * - productImage: File (required) - Product image from user
   * - textPrompt: String (required) - User's text prompt
   * - referenceImage: String (optional) - Specific reference image name
   * - productName: String (optional) - Product/brand name
   * - language: String (optional) - 'es' or 'en', default 'es'
   * - aspectRatio: String (optional) - '1:1', '9:16', '16:9', etc.
   * - contentType: String (optional) - 'promo', 'product', etc.
   * - skipText: Boolean (optional) - Skip text generation
   * - brandColors: String (optional) - JSON array of hex colors
   */
  fastify.post('/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('📨 POST /pipeline - Incoming request');
    logger.info('═══════════════════════════════════════════════════════════════');

    // Check if pipeline is ready
    const readyCheck = isPipelineReady();
    if (!readyCheck.ready) {
      return reply.status(503).send({
        success: false,
        error: readyCheck.message,
      });
    }

    let productImagePath: string | null = null;

    try {
      // Parse multipart form data
      const parts = request.parts();
      const formData: Record<string, string> = {};
      
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'productImage') {
            // Save product image to temp directory
            const tempDir = getTempUploadDir();
            const timestamp = Date.now();
            const ext = path.extname(part.filename || '.png') || '.png';
            productImagePath = path.join(tempDir, `${timestamp}_product${ext}`);
            
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(productImagePath, buffer);
            
            logger.info(`📦 Product image saved: ${productImagePath} (${buffer.length} bytes)`);
          }
        } else {
          // Text field
          formData[part.fieldname] = part.value as string;
        }
      }

      // Validate required fields
      if (!productImagePath) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required field: productImage',
        });
      }

      if (!formData.textPrompt) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required field: textPrompt',
        });
      }

      // Resolve reference image path
      let referenceImagePath: string | undefined;
      if (formData.referenceImage) {
        const refDir = path.join(process.cwd(), 'reference-images');
        const refPath = path.join(refDir, formData.referenceImage);
        if (fs.existsSync(refPath)) {
          referenceImagePath = refPath;
        } else {
          logger.warn(`Reference image not found: ${formData.referenceImage}, using random`);
        }
      }

      // Build pipeline input
      const pipelineInput: PipelineInput = {
        productImagePath,
        referenceImagePath,
        textPrompt: formData.textPrompt,
        language: (formData.language as 'es' | 'en') || 'es',
        aspectRatio: (formData.aspectRatio as '1:1' | '9:16' | '16:9' | '4:3' | '3:4') || '1:1',
        skipText: formData.skipText === 'true',
        style: formData.style || 'Elegante',
        useCase: formData.useCase || 'Promoción',
      };

      logger.info('📋 Pipeline Input:', JSON.stringify({
        ...pipelineInput,
        productImagePath: path.basename(pipelineInput.productImagePath),
        referenceImagePath: pipelineInput.referenceImagePath 
          ? path.basename(pipelineInput.referenceImagePath) 
          : '(random)',
      }, null, 2));

      // Execute pipeline
      const result: PipelineOutput = await executePipeline(pipelineInput);

      // Clean up temp file
      if (productImagePath && fs.existsSync(productImagePath)) {
        fs.unlinkSync(productImagePath);
        logger.info(`🧹 Cleaned up temp file: ${productImagePath}`);
      }

      // Return result
      return reply.send({
        success: true,
        finalImage: `data:image/png;base64,${result.finalImageBase64}`,
        baseImage: `data:image/png;base64,${result.baseImageBase64}`,
        finalImagePath: result.finalImagePath,
        baseImagePath: result.baseImagePath,
        textLayout: result.textLayout,
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Clean up temp file on error
      if (productImagePath && fs.existsSync(productImagePath)) {
        fs.unlinkSync(productImagePath);
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Pipeline execution failed:', errorMsg);
      
      return reply.status(500).send({
        success: false,
        error: errorMsg,
      });
    }
  });

  /**
   * POST /pipeline/json
   * Alternative endpoint accepting JSON body with base64 images
   * 
   * Body:
   * {
   *   productImageBase64: string (required) - Base64 encoded product image
   *   textPrompt: string (required) - User's text prompt
   *   referenceImage: string (optional) - Reference image name
   *   productName: string (optional)
   *   language: 'es' | 'en' (optional)
   *   aspectRatio: string (optional)
   *   contentType: string (optional)
   *   skipText: boolean (optional)
   *   brandColors: string[] (optional)
   * }
   */
  fastify.post('/pipeline/json', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('📨 POST /pipeline/json - Incoming request');
    logger.info('═══════════════════════════════════════════════════════════════');

    // Check if pipeline is ready
    const readyCheck = isPipelineReady();
    if (!readyCheck.ready) {
      return reply.status(503).send({
        success: false,
        error: readyCheck.message,
      });
    }

    let productImagePath: string | null = null;

    try {
      const body = request.body as {
        productImageBase64?: string;
        textPrompt?: string;
        referenceImage?: string;
        productName?: string;
        language?: 'es' | 'en';
        aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
        contentType?: 'promo' | 'announcement' | 'product' | 'event' | 'generic';
        skipText?: boolean;
        brandColors?: string[];
        style?: string;
        useCase?: string;
        textContent?: {
          headline?: string;
          subheadline?: string;
          cta?: string;
        };
        textFormat?: string; // User's description of how they want text: "50% OFF grande, ENVIO GRATIS chico"
      };

      // Validate required fields
      if (!body.productImageBase64) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required field: productImageBase64',
        });
      }

      if (!body.textPrompt) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required field: textPrompt',
        });
      }

      // Save base64 image to temp file
      const tempDir = getTempUploadDir();
      const timestamp = Date.now();
      productImagePath = path.join(tempDir, `${timestamp}_product.png`);
      
      // Handle data URL format
      let base64Data = body.productImageBase64;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(productImagePath, buffer);
      
      logger.info(`📦 Product image saved: ${productImagePath} (${buffer.length} bytes)`);

      // Resolve reference image path
      let referenceImagePath: string | undefined;
      if (body.referenceImage) {
        const refDir = path.join(process.cwd(), 'reference-images');
        const refPath = path.join(refDir, body.referenceImage);
        if (fs.existsSync(refPath)) {
          referenceImagePath = refPath;
        }
      }

      // Build pipeline input
      const pipelineInput: PipelineInput = {
        productImagePath,
        referenceImagePath,
        textPrompt: body.textPrompt,
        language: body.language || 'es',
        aspectRatio: body.aspectRatio || '1:1',
        skipText: body.skipText || false,
        style: body.style || 'Elegante',
        useCase: body.useCase || 'Promoción',
        textContent: body.textContent,
        textFormat: body.textFormat,
      };
      
      logger.info(`📐 Aspect ratio: ${pipelineInput.aspectRatio}`);
      logger.info(`🎨 Style: ${pipelineInput.style}`);
      if (body.textFormat) logger.info(`📝 Text format: ${body.textFormat}`);

      // Execute pipeline
      const result: PipelineOutput = await executePipeline(pipelineInput);

      // Clean up temp file
      if (productImagePath && fs.existsSync(productImagePath)) {
        fs.unlinkSync(productImagePath);
      }

      return reply.send({
        success: true,
        finalImage: `data:image/png;base64,${result.finalImageBase64}`,
        baseImage: `data:image/png;base64,${result.baseImageBase64}`,
        finalImagePath: result.finalImagePath,
        baseImagePath: result.baseImagePath,
        textLayout: result.textLayout,
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Clean up temp file on error
      if (productImagePath && fs.existsSync(productImagePath)) {
        fs.unlinkSync(productImagePath);
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Pipeline execution failed:', errorMsg);
      
      return reply.status(500).send({
        success: false,
        error: errorMsg,
      });
    }
  });

  /**
   * POST /pipeline/reformat
   * Adapta la MISMA imagen base a un formato diferente
   * Útil para: "La quiero en Story" después de generar un Post
   */
  fastify.post('/pipeline/reformat', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('🔄 POST /pipeline/reformat - Reformatting existing image');
    logger.info('═══════════════════════════════════════════════════════════════');

    try {
      const body = request.body as {
        baseImageBase64: string;      // La imagen base (sin texto) original
        newAspectRatio: '1:1' | '9:16' | '16:9';
        style?: string;
        textContent?: {
          headline?: string;
          subheadline?: string;
          cta?: string;
        };
        language?: 'es' | 'en';
      };

      if (!body.baseImageBase64) {
        return reply.status(400).send({
          success: false,
          error: 'Missing baseImageBase64',
        });
      }

      if (!body.newAspectRatio) {
        return reply.status(400).send({
          success: false,
          error: 'Missing newAspectRatio',
        });
      }

      logger.info(`📐 Reformatting to ${body.newAspectRatio}`);

      // Import sharp y servicios necesarios
      const sharp = (await import('sharp')).default;
      const { generateProfessionalLayout, generateFallbackLayout } = await import('../services/textLayoutGenerator');
      const { composeWithCanvas } = await import('../services/textCompositorPro');

      // Decodificar imagen base
      let base64Data = body.baseImageBase64;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Obtener dimensiones originales
      const metadata = await sharp(imageBuffer).metadata();
      const originalWidth = metadata.width || 1080;
      const originalHeight = metadata.height || 1080;
      
      logger.info(`📷 Original: ${originalWidth}x${originalHeight}`);

      // Calcular nuevas dimensiones según aspect ratio
      let newWidth: number;
      let newHeight: number;
      
      switch (body.newAspectRatio) {
        case '9:16': // Story vertical
          newWidth = 1080;
          newHeight = 1920;
          break;
        case '16:9': // Horizontal
          newWidth = 1920;
          newHeight = 1080;
          break;
        case '1:1': // Post cuadrado
        default:
          newWidth = 1080;
          newHeight = 1080;
          break;
      }

      logger.info(`📐 New format: ${newWidth}x${newHeight}`);

      // Adaptar imagen al nuevo formato usando cover (recorte centrado)
      const resizedBuffer = await sharp(imageBuffer)
        .resize(newWidth, newHeight, {
          fit: 'cover',
          position: 'centre',
        })
        .png()
        .toBuffer();

      // Guardar temporalmente
      const tempDir = getTempUploadDir();
      const timestamp = Date.now();
      const reformattedPath = path.join(tempDir, `${timestamp}_reformatted.png`);
      fs.writeFileSync(reformattedPath, resizedBuffer);

      let finalImagePath = reformattedPath;
      let finalImageBase64 = resizedBuffer.toString('base64');

      // Si hay texto, aplicarlo
      const hasText = body.textContent && 
        (body.textContent.headline || body.textContent.subheadline || body.textContent.cta);

      if (hasText && body.textContent) {
        logger.info('📝 Applying text to reformatted image...');

        const layoutInput = {
          textContent: body.textContent,
          style: body.style || 'Moderno',
          useCase: 'Promoción',
          imageWidth: newWidth,
          imageHeight: newHeight,
          imageTheme: 'dark' as const,
          language: body.language || 'es' as const,
        };

        let layoutResult;
        try {
          layoutResult = await generateProfessionalLayout(layoutInput);
        } catch {
          layoutResult = generateFallbackLayout(body.textContent, body.style || 'Moderno');
        }

        // Filtrar CTA si no fue pedido
        const userRequestedCta = body.textContent.cta && body.textContent.cta.trim().length > 0;
        if (!userRequestedCta && layoutResult.elements) {
          layoutResult.elements = layoutResult.elements.filter(el => el.type !== 'cta');
        }

        const compositorResult = await composeWithCanvas({
          baseImagePath: reformattedPath,
          layout: layoutResult,
          outputFormat: 'png',
          quality: 95,
        });

        finalImagePath = compositorResult.imagePath;
        finalImageBase64 = compositorResult.imageBase64;
      }

      logger.info('✅ Reformat complete');

      return reply.send({
        success: true,
        finalImage: `data:image/png;base64,${finalImageBase64}`,
        baseImage: `data:image/png;base64,${resizedBuffer.toString('base64')}`,
        format: body.newAspectRatio,
        dimensions: { width: newWidth, height: newHeight },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Reformat failed:', errorMsg);
      
      return reply.status(500).send({
        success: false,
        error: errorMsg,
      });
    }
  });

  logger.info('✅ Pipeline routes registered: /pipeline, /pipeline/status, /pipeline/references, /pipeline/json, /pipeline/reformat');
}

