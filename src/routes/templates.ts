/**
 * Template Routes
 * API endpoints for managing and using text templates
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { 
  listTemplates, 
  getTemplate, 
  loadTemplate,
  applyTextToTemplate,
  formatTemplateForChat,
  type TemplateWithImage 
} from '../services/templateService';
import { composeWithCanvas } from '../services/textCompositorPro';
import { generateBaseImage } from '../services/nanoBananaGenerator';
import * as fs from 'fs';
import * as path from 'path';

export default async function templateRoutes(fastify: FastifyInstance): Promise<void> {
  
  /**
   * GET /templates - List all available templates
   */
  fastify.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('📋 GET /templates - Listing all templates');
    
    try {
      const templates = listTemplates();
      
      const response = templates.map(t => ({
        name: t.template.name,
        description: t.template.description,
        style: t.template.style,
        slots: t.template.textSlots.map(s => ({
          id: s.id,
          label: s.label,
        })),
        previewImage: `data:image/png;base64,${t.imageBase64}`,
      }));
      
      return reply.send({
        success: true,
        count: response.length,
        templates: response,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list templates:', msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });
  
  /**
   * GET /templates/:style - Get templates for a specific style
   */
  fastify.get('/templates/:style', async (request: FastifyRequest, reply: FastifyReply) => {
    const { style } = request.params as { style: string };
    logger.info(`📋 GET /templates/${style}`);
    
    try {
      const templates = listTemplates().filter(t => 
        t.template.style.toLowerCase() === style.toLowerCase()
      );
      
      if (templates.length === 0) {
        return reply.status(404).send({ 
          success: false, 
          error: `No templates found for style: ${style}` 
        });
      }
      
      const response = templates.map(t => formatTemplateForChat(t));
      
      return reply.send({
        success: true,
        count: response.length,
        templates: response,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ success: false, error: msg });
    }
  });
  
  /**
   * POST /templates/apply - Apply user text to a template and generate image
   */
  fastify.post('/templates/apply', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('🎨 POST /templates/apply - Generating image from template');
    
    try {
      const body = request.body as {
        templateStyle?: string;
        templatePath?: string;  // Alternative: "old-money/19"
        templateIndex?: number;
        productImageBase64: string;
        texts: Record<string, string>;  // { "top-title": "Mi Producto", "bottom-promo": "50% OFF" }
        aspectRatio?: '1:1' | '9:16' | '16:9';
        sceneDescription?: string;
      };
      
      // Get the template - support both templateStyle and templatePath
      let style = body.templateStyle;
      if (!style && body.templatePath) {
        // Extract style from path like "old-money/19"
        style = body.templatePath.split('/')[0];
      }
      
      if (!style) {
        style = 'old-money'; // Default
      }
      
      const templateWithImage = getTemplate(style, body.templateIndex || 0);
      if (!templateWithImage) {
        return reply.status(404).send({ 
          success: false, 
          error: `Template not found for style: ${style}` 
        });
      }
      
      const { template, imagePath } = templateWithImage;
      
      logger.info(`📋 Using template: ${template.name}`);
      logger.info(`📝 User texts: ${JSON.stringify(body.texts)}`);
      
      // Step 1: Generate base image with Nano Banana
      logger.info('🖼️ Step 1: Generating base image...');
      
      // Save product image temporarily
      const tempDir = path.join(process.cwd(), 'temp-uploads');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      
      const productPath = path.join(tempDir, `${Date.now()}_product.png`);
      const productBuffer = Buffer.from(body.productImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      fs.writeFileSync(productPath, productBuffer);
      
      const baseImageResult = await generateBaseImage({
        referenceImagePath: imagePath,
        productImagePath: productPath,
        userIntent: body.sceneDescription || `promotional product photo in ${template.style} style`,
        aspectRatio: body.aspectRatio || '1:1',
      });
      
      // Clean up temp file
      fs.unlinkSync(productPath);
      
      // Step 2: Apply template text
      logger.info('📝 Step 2: Applying template text...');
      const textElements = applyTextToTemplate(template, body.texts);
      
      // Step 3: Compose final image
      logger.info('🎨 Step 3: Composing final image...');
      const composedResult = await composeWithCanvas({
        baseImagePath: baseImageResult.imagePath,
        layout: {
          elements: textElements as any,  // Type cast due to template flexibility
          theme: 'dark',
        },
        outputFormat: 'png',
        quality: 95,
      });
      
      logger.info('✅ Image generated successfully with template');
      
      return reply.send({
        success: true,
        finalImage: `data:image/png;base64,${composedResult.imageBase64}`,
        baseImage: `data:image/png;base64,${baseImageResult.imageBase64}`,
        templateUsed: template.name,
        textsApplied: body.texts,
        metadata: {
          width: composedResult.width,
          height: composedResult.height,
        },
      });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Template apply failed:', msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });
  
  logger.info('✅ Template routes registered: /templates, /templates/:style, /templates/apply');
}

