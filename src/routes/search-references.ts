import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import * as path from 'path';
import { searchReferenceImages } from '../services/referenceLibrarySqlite';

interface SearchReferencesBody {
  query: string;
  limit?: number;
}

export default async function searchReferencesRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/search-references', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query, limit } = request.body as SearchReferencesBody;

      if (!query || typeof query !== 'string') {
        return reply.status(400).send({
          status: 'error',
          message: 'Missing or invalid "query" field',
        });
      }

      logger.info(`🔍 Searching reference images for: "${query}"`);

      const results = await searchReferenceImages({
        query,
        limit: limit || 3,
      });

      // Convert absolute paths to relative web paths
      const webResults = results.map(result => ({
        id: result.id,
        filename: result.filename,
        url: `/reference-library/images/${result.filename}`,
        keywords: result.keywords,
        description: result.description,
        relevance_score: result.relevance_score,
      }));

      logger.info(`✅ Found ${webResults.length} reference images`);

      return reply.send({
        status: 'success',
        query,
        count: webResults.length,
        results: webResults,
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Reference search error:', errorMsg);
      
      return reply.status(500).send({
        status: 'error',
        message: 'Error searching reference images',
        details: errorMsg,
      });
    }
  });

  logger.info('✅ Search references route registered: POST /search-references');
}

