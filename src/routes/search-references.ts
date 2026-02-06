/**
 * =============================================================================
 * SEARCH REFERENCES - VERSION 2 (STABLE)
 * =============================================================================
 * DO NOT EDIT without explicit permission from the user.
 * 
 * Features:
 * - Filters by productCategory (cream, lipstick, serum) for precise matching
 * - Fallback to industry filter when category has no matches
 * - Category normalization in agent (facial cream -> cream)
 * 
 * Last verified: 2026-01-30
 * =============================================================================
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { searchReferenceImages } from '../services/referenceLibrarySqlite';
import { requireUser } from '../services/firebaseAuth';

interface SearchReferencesBody {
  query: string;
  limit?: number;
  userId?: string; // internal-token auth fallback
  postType?: string; // filter by post type (e.g., 'hero-shot', 'product-on-human')
  productCategory?: string; // V2: filter by product category (e.g., 'cream', 'lipstick', 'serum')
  industry?: string; // V2: fallback filter by industry (e.g., 'beauty', 'fashion')
}

export default async function searchReferencesRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/search-references', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query, limit, postType, productCategory, industry } = request.body as SearchReferencesBody;

      if (!query || typeof query !== 'string') {
        return reply.status(400).send({
          status: 'error',
          message: 'Missing or invalid "query" field',
        });
      }

      // Auth modes:
      // - Preferred: Firebase ID token in Authorization header (requireUser)
      // - Internal: X-Postty-Internal-Token + userId field (used by internal agents/tools)
      let uid: string | null = null;
      try {
        const user = await requireUser(request as any);
        uid = user.uid;
      } catch (e) {
        const tokenHeader = request.headers['x-postty-internal-token'];
        const raw =
          typeof tokenHeader === 'string'
            ? tokenHeader
            : Array.isArray(tokenHeader)
              ? tokenHeader[0]
              : '';
        const expected = process.env.POSTTY_INTERNAL_TOKEN || '';
        const allowed = expected && raw && raw === expected;
        const bodyUidRaw = (request.body as any)?.userId;
        const bodyUid = typeof bodyUidRaw === 'string' ? bodyUidRaw.trim() : '';
        if (allowed && bodyUid.length > 0) {
          uid = bodyUid;
        } else {
          throw e;
        }
      }

      logger.info(`🔍 Searching reference images for: "${query}"${postType ? ` (postType: ${postType})` : ''}${productCategory ? ` (productCategory: ${productCategory})` : ''}${industry ? ` (industry: ${industry})` : ''}`);

      const results = await searchReferenceImages({
        uid: uid!,
        query,
        limit: limit || 3,
        postType: postType,
        productCategory: productCategory, // V2: Filter by product category (cream, lipstick, serum)
        industry: industry, // V2: Fallback filter by industry
      });

      logger.info(`✅ Found ${results.length} reference images`);

      return reply.send({
        status: 'success',
        query,
        count: results.length,
        results: results.map((r) => ({
          id: r.id,
          scope: r.scope,
          url: r.url, // signed S3 URL
          tags: r.tags,
          industry: r.industry,
          aesthetic: r.aesthetic,
          mood: r.mood,
          design_guidelines: r.design_guidelines,
          relevance_score: r.relevance_score,
          ranking: r.ranking ?? 1,
          post_type: r.post_type || null,
          product_category: r.product_category || null,
          text_in_image: r.text_in_image || null,
          text_analysis: r.text_analysis || null,
        })),
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Reference search error:', errorMsg);

      const status = errorMsg.toLowerCase().includes('authorization') ? 401 : 500;
      return reply.status(status).send({ status: 'error', message: errorMsg });
    }
  });

  logger.info('✅ Search references route registered: POST /search-references');
}

