/**
 * Apply Design Guidelines Text Route
 * Applies text using design_guidelines from SQLite database
 * Adapts typography based on product image characteristics
 * 
 * POST /apply-design-guidelines-text - Apply text using design guidelines
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as logger from '../utils/logger';
import {
  applyDesignGuidelinesText,
  type DesignGuidelines,
  type ProductAnalysis,
} from '../services/designGuidelinesTextApplicator';

interface ApplyDesignGuidelinesRequest {
  Body: {
    baseImagePath: string;
    designGuidelines: DesignGuidelines;
    productAnalysis: ProductAnalysis;
    userText: string[]; // Array of text in order
  };
}

/**
 * Register apply design guidelines text routes
 */
export default async function applyDesignGuidelinesTextRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /apply-design-guidelines-text
   * Apply text using design guidelines from SQLite
   * 
   * Body:
   * - baseImagePath: Path to the generated base image
   * - designGuidelines: Full design_guidelines object from SQLite
   * - productAnalysis: Product image characteristics (colors, category, composition)
   * - userText: Array of text strings to apply (by position)
   */
  fastify.post<ApplyDesignGuidelinesRequest>(
    '/apply-design-guidelines-text',
    async (request: FastifyRequest<ApplyDesignGuidelinesRequest>, reply: FastifyReply) => {
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('📨 POST /apply-design-guidelines-text - Incoming request');
      logger.info('═══════════════════════════════════════════════════════════════');

      try {
        const { baseImagePath, designGuidelines, productAnalysis, userText } = request.body;

        // Validate required fields
        if (!baseImagePath) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required field: baseImagePath',
          });
        }

        if (!designGuidelines) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required field: designGuidelines',
          });
        }

        if (!userText || !Array.isArray(userText)) {
          return reply.status(400).send({
            success: false,
            error: 'Missing or invalid field: userText (must be array)',
          });
        }

        logger.info(`📷 Base image: ${baseImagePath}`);
        logger.info(`✏️  User texts: ${JSON.stringify(userText)}`);
        logger.info(`🎨 Has typography specs: ${!!designGuidelines.typography}`);
        logger.info(`🔍 Product category: ${productAnalysis?.category || 'unknown'}`);

        // Validate base image exists
        if (!fs.existsSync(baseImagePath)) {
          return reply.status(404).send({
            success: false,
            error: `Base image not found: ${baseImagePath}`,
          });
        }

        // Check if design guidelines has typography info
        if (!designGuidelines.typography) {
          logger.warn('⚠️  No typography specs in design guidelines, using defaults');
        }

        // Apply design guidelines text to image
        const result = await applyDesignGuidelinesText(
          baseImagePath,
          designGuidelines,
          productAnalysis || {},
          userText
        );

        logger.info('✅ Design guidelines application successful');
        logger.info(`📁 Final image: ${result.imagePath}`);

        // Build textLayout structure for frontend
        const textLayout = {
          elements: userText.map((text, index) => {
            // Get the appropriate typography spec with proper type handling
            let typographySpec: any;
            if (index === 0 && designGuidelines.typography?.headline) {
              typographySpec = designGuidelines.typography.headline;
            } else if (index === 1 && designGuidelines.typography?.subheadline) {
              typographySpec = designGuidelines.typography.subheadline;
            } else if (designGuidelines.typography?.badges) {
              typographySpec = designGuidelines.typography.badges;
            } else {
              typographySpec = {};
            }

            return {
              text: text,
              type: index === 0 ? 'headline' : index === 1 ? 'subheadline' : 'cta',
              position: {
                x: 50, // Default center
                y: index === 0 ? 15 : index === 1 ? 35 : 85,
                anchor: (typographySpec.alignment as string) || 'center',
              },
              style: {
                fontFamily: (typographySpec.font_style as string) || 'sans-serif',
                fontSize: (typographySpec.size as string) || 'medium',
                fontWeight: (typographySpec.font_weight as string) || 'regular',
                color: (typographySpec.color as string) || '#FFFFFF',
              },
            };
          }),
        };

        // Return result
        return reply.send({
          success: true,
          finalImagePath: result.imagePath,
          finalImage: `data:image/png;base64,${result.imageBase64}`,
          width: result.width,
          height: result.height,
          textLayout: textLayout,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('═══════════════════════════════════════════════════════════════');
        logger.error('❌ /apply-design-guidelines-text - Failed');
        logger.error(`Error: ${msg}`);
        logger.error('═══════════════════════════════════════════════════════════════');

        return reply.status(500).send({
          success: false,
          error: 'Failed to apply design guidelines text',
          details: msg,
        });
      }
    }
  );

  logger.info('✅ Design guidelines text route registered: POST /apply-design-guidelines-text');
}

