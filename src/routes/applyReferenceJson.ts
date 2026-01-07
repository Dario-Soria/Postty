/**
 * Apply Reference JSON Route
 * Applies reference JSON text layout directly to a base image
 * 
 * POST /apply-reference-json - Apply JSON text to image
 * 
 * ============================================================================
 * DEPRECATED 2025-01-07
 * ============================================================================
 * This route is deprecated. Text generation now uses SQLite design_guidelines
 * column instead of JSON files from reference-library/Jsons/ folder.
 * 
 * New route: POST /apply-design-guidelines-text (applyDesignGuidelinesText.ts)
 * 
 * This route is kept active for backward compatibility but will log deprecation
 * warnings when called.
 * ============================================================================
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { applyReferenceJSON } from '../services/jsonTextApplicator';

interface ApplyJSONRequest {
  Body: {
    baseImagePath: string;
    referenceFilename: string;
    userText: string[]; // Array of text in order
  };
}

/**
 * Register apply reference JSON routes
 */
export default async function applyReferenceJsonRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /apply-reference-json
   * Apply reference JSON text layout to a base image
   * 
   * Body:
   * - baseImagePath: Path to the generated base image
   * - referenceFilename: Filename of the reference image (e.g., "fac807b9811734d903ec037a7732fc05.jpg")
   * - userText: Array of text strings to replace JSON content (by position)
   */
  fastify.post<ApplyJSONRequest>(
    '/apply-reference-json',
    async (request: FastifyRequest<ApplyJSONRequest>, reply: FastifyReply) => {
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('📨 POST /apply-reference-json - Incoming request');
      logger.warn('⚠️  DEPRECATED: This endpoint is deprecated. Use /apply-design-guidelines-text instead');
      logger.info('═══════════════════════════════════════════════════════════════');

      try {
        const { baseImagePath, referenceFilename, userText } = request.body;

        // Validate required fields
        if (!baseImagePath) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required field: baseImagePath',
          });
        }

        if (!referenceFilename) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required field: referenceFilename',
          });
        }

        if (!userText || !Array.isArray(userText)) {
          return reply.status(400).send({
            success: false,
            error: 'Missing or invalid field: userText (must be array)',
          });
        }

        logger.info(`📷 Base image: ${baseImagePath}`);
        logger.info(`📄 Reference: ${referenceFilename}`);
        logger.info(`✏️  User texts: ${JSON.stringify(userText)}`);

        // Validate base image exists
        if (!fs.existsSync(baseImagePath)) {
          return reply.status(404).send({
            success: false,
            error: `Base image not found: ${baseImagePath}`,
          });
        }

        // Build JSON path from reference filename
        const baseName = path.parse(referenceFilename).name;
        const jsonPath = path.join(
          process.cwd(),
          'reference-library',
          'Jsons',
          `${baseName}.json`
        );

        logger.info(`📋 Looking for JSON: ${jsonPath}`);

        // Check if JSON exists
        if (!fs.existsSync(jsonPath)) {
          return reply.status(404).send({
            success: false,
            error: `Reference JSON not found: ${baseName}.json`,
            message: 'This reference image does not have an associated JSON layout file',
          });
        }

        // Apply JSON to image
        const result = await applyReferenceJSON(
          baseImagePath,
          jsonPath,
          userText
        );

        logger.info('✅ JSON application successful');
        logger.info(`📁 Final image: ${result.imagePath}`);

        // Load the reference JSON to extract textLayout structure
        let textLayout = null;
        try {
          const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          // Convert JSON format to textLayout format
          textLayout = {
            elements: userText.map((text, index) => {
              const jsonElement = jsonContent.texts[index];
              if (!jsonElement) return null;
              
              return {
                text: text,
                type: index === 0 ? 'headline' : index === 1 ? 'subheadline' : 'body',
                position: {
                  x: jsonElement.position.x * 100, // Convert 0-1 to 0-100
                  y: jsonElement.position.y * 100,
                  anchor: jsonElement.alignment || 'center',
                },
                style: {
                  fontFamily: jsonElement.font.family,
                  fontSize: jsonElement.size_px,
                  fontWeight: jsonElement.font.weight.toString(),
                  color: jsonElement.color,
                  letterSpacing: jsonElement.letter_spacing,
                  maxWidth: jsonElement.max_width ? jsonElement.max_width * 100 : undefined,
                },
              };
            }).filter(Boolean),
          };
        } catch (e) {
          logger.warn('Could not extract textLayout from JSON');
        }

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
        logger.error('❌ /apply-reference-json - Failed');
        logger.error(`Error: ${msg}`);
        logger.error('═══════════════════════════════════════════════════════════════');

        return reply.status(500).send({
          success: false,
          error: 'Failed to apply reference JSON',
          details: msg,
        });
      }
    }
  );
}

