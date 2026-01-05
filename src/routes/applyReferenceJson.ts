/**
 * Apply Reference JSON Route
 * Applies reference JSON text layout directly to a base image
 * 
 * POST /apply-reference-json - Apply JSON text to image
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

        // Return result
        return reply.send({
          success: true,
          finalImagePath: result.imagePath,
          finalImage: `data:image/png;base64,${result.imageBase64}`,
          width: result.width,
          height: result.height,
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

