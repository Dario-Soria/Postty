/**
 * Product Agent Routes
 * Conversational agent for product showcase posts
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { analyzeProduct, ProductAnalysis } from '../services/productAnalyzer';
import { searchReferences, getReferencesWithPreviews, getReferenceWithPreview, ReferenceImage } from '../services/referenceSearch';
import { analyzeReference, buildPromptFromResources, DesignResources } from '../services/referenceAnalyzer';
import { extractTextsFromInput } from '../services/textExtractor';

export default async function productAgentRoutes(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Step 1: Analyze product image
   * Returns product type, category, and suggested post types
   */
  fastify.post('/agent/analyze-product', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('🔍 POST /agent/analyze-product');
    
    try {
      const body = request.body as { imageBase64: string };
      
      if (!body.imageBase64) {
        return reply.status(400).send({ success: false, error: 'imageBase64 required' });
      }
      
      // Remove data URL prefix if present
      const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      
      const analysis = await analyzeProduct(base64Data);
      
      return reply.send({
        success: true,
        analysis
      });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in /agent/analyze-product:', msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  /**
   * Step 2: Search references by keywords/description
   * Returns top 3 matching references with previews
   */
  fastify.post('/agent/search-references', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('🔍 POST /agent/search-references');
    
    try {
      const body = request.body as { 
        keywords: string[];
        style?: string;
        postType?: string;
      };
      
      if (!body.keywords || body.keywords.length === 0) {
        return reply.status(400).send({ success: false, error: 'keywords array required' });
      }
      
      // Combine all search terms
      const searchTerms = [...body.keywords];
      if (body.style) searchTerms.push(body.style);
      if (body.postType) searchTerms.push(body.postType);
      
      // Search references
      const references = searchReferences(searchTerms, 3);
      
      // Add previews
      const refsWithPreviews = getReferencesWithPreviews(references);
      
      return reply.send({
        success: true,
        references: refsWithPreviews.map(ref => ({
          id: ref.id,
          style: ref.style,
          name: ref.metadata.name,
          description: ref.metadata.description,
          keywords: ref.keywords,
          previewImage: ref.previewBase64
        }))
      });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in /agent/search-references:', msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  /**
   * Step 3: Analyze selected reference
   * Returns design resources extracted from the reference
   */
  fastify.post('/agent/analyze-reference', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('🔍 POST /agent/analyze-reference');
    
    try {
      const body = request.body as { referenceId: string };
      
      if (!body.referenceId) {
        return reply.status(400).send({ success: false, error: 'referenceId required' });
      }
      
      // Get reference with full path
      const reference = getReferenceWithPreview(body.referenceId);
      
      if (!reference) {
        return reply.status(404).send({ success: false, error: 'Reference not found' });
      }
      
      // Analyze the reference
      const designResources = await analyzeReference(reference.path);
      
      return reply.send({
        success: true,
        reference: {
          id: reference.id,
          style: reference.style,
          name: reference.metadata.name,
          templatePath: reference.templatePath
        },
        designResources
      });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in /agent/analyze-reference:', msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  /**
   * Build generation prompt from all collected data
   */
  fastify.post('/agent/build-prompt', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('📝 POST /agent/build-prompt');
    
    try {
      const body = request.body as {
        designResources: DesignResources;
        productDescription: string;
        userContext: string;
      };
      
      if (!body.designResources || !body.productDescription) {
        return reply.status(400).send({ 
          success: false, 
          error: 'designResources and productDescription required' 
        });
      }
      
      const prompt = buildPromptFromResources(
        body.designResources,
        body.productDescription,
        body.userContext || ''
      );
      
      return reply.send({
        success: true,
        prompt
      });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in /agent/build-prompt:', msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  /**
   * Extract promotional texts from natural language
   */
  fastify.post('/agent/extract-texts', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('📝 POST /agent/extract-texts');
    
    try {
      const body = request.body as {
        userInput: string;
        productType: string;
        productDescription: string;
      };
      
      if (!body.userInput) {
        return reply.status(400).send({ success: false, error: 'userInput required' });
      }
      
      const texts = await extractTextsFromInput(
        body.userInput,
        body.productType || 'producto',
        body.productDescription || ''
      );
      
      return reply.send({
        success: true,
        texts
      });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in /agent/extract-texts:', msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  logger.info('✅ Product Agent routes registered: /agent/analyze-product, /agent/search-references, /agent/analyze-reference, /agent/extract-texts, /agent/build-prompt');
}

