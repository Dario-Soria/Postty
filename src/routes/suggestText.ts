/**
 * Suggest Text Route
 * Uses Gemini to generate creative headlines based on user intent
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';

interface SuggestTextBody {
  userIntent: string;
  style?: string;
  useCase?: string;
}

export default async function suggestTextRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /suggest-text
   * Generate headline suggestions based on user intent
   */
  fastify.post('/suggest-text', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as SuggestTextBody;

    if (!body.userIntent) {
      return reply.status(400).send({
        success: false,
        error: 'Missing userIntent',
      });
    }

    logger.info('💡 Generating text suggestions...');
    logger.info(`   Intent: "${body.userIntent}"`);
    logger.info(`   Style: ${body.style || 'not specified'}`);
    logger.info(`   UseCase: ${body.useCase || 'not specified'}`);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
      }

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const prompt = `Sos un experto en copywriting para redes sociales. 
El usuario quiere crear un post con este mensaje: "${body.userIntent}"
Estilo visual: ${body.style || 'moderno'}
Objetivo: ${body.useCase || 'promoción'}

Generá UN headline corto y potente (máximo 4-5 palabras) y UN subtítulo complementario (máximo 6-7 palabras).

REGLAS:
- El headline debe ser IMPACTANTE y corto
- Usá mayúsculas para el headline si es apropiado
- El subtítulo complementa, no repite
- Sé creativo pero claro
- Adaptá al estilo visual indicado
- Si mencionan descuento/oferta, destacalo
- Si es "Old Money" usá lenguaje elegante y sofisticado
- Si es "Vibrante" usá energía y emoción
- Si es "Minimalista" sé ultra conciso

Respondé SOLO con JSON válido, sin markdown:
{"headline": "TEXTO PRINCIPAL", "subheadline": "texto secundario"}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      logger.info(`   Gemini response: ${text}`);

      // Parse JSON response
      let suggestion;
      try {
        // Remove any markdown code blocks if present
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestion = JSON.parse(cleanText);
      } catch {
        logger.warn('Failed to parse Gemini response as JSON, using fallback');
        // Fallback: use user intent directly
        suggestion = {
          headline: body.userIntent.toUpperCase().slice(0, 30),
          subheadline: '',
        };
      }

      logger.info('✅ Text suggestion generated');
      logger.info(`   Headline: "${suggestion.headline}"`);
      logger.info(`   Subheadline: "${suggestion.subheadline}"`);

      return reply.send({
        success: true,
        suggestion,
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Text suggestion failed:', errorMsg);

      // Fallback response
      return reply.send({
        success: true,
        suggestion: {
          headline: body.userIntent.toUpperCase().slice(0, 25),
          subheadline: '',
        },
      });
    }
  });

  logger.info('✅ Suggest text route registered: /suggest-text');
}

