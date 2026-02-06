/**
 * =============================================================================
 * GET POST TYPES - VERSION 1 (STABLE) - BACKUP
 * =============================================================================
 * DO NOT EDIT without explicit permission from the user.
 * This endpoint is working correctly and should not be modified.
 * Last verified: 2026-01-30
 * =============================================================================
 */
import { FastifyPluginAsync } from 'fastify';
import { Pool } from 'pg';
import { getSignedGetObjectUrl } from '../services/s3Client';
import * as logger from '../utils/logger';

// Get the pool (same pattern as referenceLibrarySqlite)
let _pool: Pool | null = null;

function normalizeDatabaseUrl(raw: string): string {
  let s = (raw || '').trim();
  if (s.toLowerCase().startsWith('psql ')) {
    s = s.slice('psql '.length).trim();
  }
  if (
    (s.startsWith("'") && s.endsWith("'") && s.length > 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length > 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = normalizeDatabaseUrl(
    process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || ''
  );
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL (Neon Postgres connection string)');
  }
  _pool = new Pool({ connectionString, max: 10 });
  return _pool;
}

export type PostTypeOption = {
  type: string;
  label: string;
  exampleImage: {
    url: string;
    id: string;
  };
};

// Map post_type to human-readable labels
const postTypeLabels: Record<string, string> = {
  'hero-shot': 'Hero Shot',
  'product-on-human': 'Product on human',
  'lifestyle': 'Lifestyle',
  'flat-lay': 'Flat Lay',
  'unboxing': 'Unboxing',
  'before-after': 'Before & After',
  'ingredients': 'Ingredientes',
  'texture-closeup': 'Textura',
  'comparison': 'Comparación',
  'testimonial': 'Testimonial',
  'how-to': 'Tutorial',
  'seasonal': 'Seasonal',
  'promo-sale': 'Promo/Sale',
};

const getPostTypesRoute: FastifyPluginAsync = async (fastify) => {
  logger.info('✅ Get post types route registered: POST /get-post-types');
  
  fastify.post<{
    Body: {
      productAnalysis?: string;
      industry?: string;
      limit?: number;
    };
  }>('/get-post-types', async (request, reply) => {
    try {
      const { productAnalysis, industry, limit = 4 } = request.body || {};
      const pool = getPool();

      // Get distinct post_types with one example image each
      // Filter by industry if provided for relevance
      let result;
      
      if (industry && industry.trim()) {
        // Filter by industry
        result = await pool.query(`
          SELECT DISTINCT ON (post_type) 
            post_type, 
            id, 
            s3_bucket, 
            s3_key,
            industry,
            tags
          FROM reference_images
          WHERE post_type IS NOT NULL AND post_type != ''
            AND LOWER(industry) = LOWER($1)
          ORDER BY post_type, ranking DESC, created_at DESC
        `, [industry.trim()]);
        
        // If we didn't get enough types, supplement with other industries
        if (result.rows.length < 2) {
          result = await pool.query(`
            SELECT DISTINCT ON (post_type) 
              post_type, 
              id, 
              s3_bucket, 
              s3_key,
              industry,
              tags
            FROM reference_images
            WHERE post_type IS NOT NULL AND post_type != ''
            ORDER BY post_type, 
              CASE WHEN LOWER(industry) = LOWER($1) THEN 0 ELSE 1 END,
              ranking DESC, 
              created_at DESC
          `, [industry.trim()]);
        }
      } else {
        // No filters - use default ordering
        result = await pool.query(`
          SELECT DISTINCT ON (post_type) 
            post_type, 
            id, 
            s3_bucket, 
            s3_key,
            industry,
            tags
          FROM reference_images
          WHERE post_type IS NOT NULL AND post_type != ''
          ORDER BY post_type, ranking DESC, created_at DESC
        `);
      }

      if (result.rows.length === 0) {
        return reply.status(200).send({
          status: 'success',
          postTypes: [],
        });
      }

      // Score post types by relevance to product/industry if provided
      let scoredTypes = result.rows.map((row: any) => {
        let score = 0;
        
        // Boost based on industry match
        if (industry && row.industry) {
          if (row.industry.toLowerCase().includes(industry.toLowerCase())) {
            score += 10;
          }
        }
        
        // Boost based on tags matching product analysis
        if (productAnalysis && Array.isArray(row.tags)) {
          const analysisTerms = productAnalysis.toLowerCase().split(/\s+/);
          for (const term of analysisTerms) {
            if (row.tags.some((t: string) => t.toLowerCase().includes(term))) {
              score += 2;
            }
          }
        }
        
        return { ...row, score };
      });

      // Sort by score and take top N
      scoredTypes.sort((a, b) => b.score - a.score);
      const topTypes = scoredTypes.slice(0, Math.min(limit, 4));

      // Generate signed URLs and format response
      const postTypes: PostTypeOption[] = await Promise.all(
        topTypes.map(async (row: any) => ({
          type: row.post_type,
          label: postTypeLabels[row.post_type] || row.post_type.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          exampleImage: {
            url: await getSignedGetObjectUrl({
              bucket: row.s3_bucket,
              key: row.s3_key,
              expiresSeconds: 10 * 60,
            }),
            id: row.id,
          },
        }))
      );

      return reply.status(200).send({
        status: 'success',
        postTypes,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`get-post-types error: ${msg}`);
      return reply.status(500).send({
        status: 'error',
        message: msg,
      });
    }
  });
};

export default getPostTypesRoute;
