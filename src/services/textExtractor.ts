/**
 * Text Extractor Service
 * Extracts promotional text elements from natural user input
 */

import { GoogleGenAI } from '@google/genai';
import * as logger from '../utils/logger';

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

export interface ExtractedTexts {
  title: string;        // Product name / main title
  subtitle: string;     // Brand or concept
  promo: string;        // Main promotion (3X2, 50% OFF, etc.)
  extra: string;        // Extra info (ENVÍO GRATIS, etc.)
}

/**
 * Extract promotional texts from natural language input
 */
export async function extractTextsFromInput(
  userInput: string,
  productType: string,
  productDescription: string
): Promise<ExtractedTexts> {
  const apiKey = requireGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Sos un experto en marketing de e-commerce. El usuario quiere crear un post promocional.

PRODUCTO: ${productType} - ${productDescription}

INPUT DEL USUARIO: "${userInput}"

Extraé los textos para el post. RESPONDE SOLO JSON VÁLIDO:

{
  "title": "Nombre del producto o título principal (ej: 'Polo Tejido', 'Zuecos Monaco'). Si el usuario no lo menciona, usa el tipo de producto de forma elegante.",
  "subtitle": "Marca o concepto secundario (ej: 'STAR CONCEPT', 'NUEVA COLECCIÓN'). Si no hay, dejá vacío.",
  "promo": "La promoción principal en MAYÚSCULAS y formato impactante (ej: '3X2', '50% OFF', '30% OFF + ENVÍO GRATIS'). Combiná ofertas si el usuario menciona varias.",
  "extra": "Información extra secundaria (ej: 'ENVÍO GRATIS', 'SOLO HOY', 'ÚLTIMAS UNIDADES'). Si ya está en promo, dejá vacío."
}

REGLAS:
- Si el usuario dice "3x2 con envío gratis" → promo: "3X2 + ENVÍO GRATIS", extra: ""
- Si el usuario dice "30% de descuento" → promo: "30% OFF"
- Si el usuario dice "envío gratis" solamente → promo: "ENVÍO GRATIS"
- Si no menciona promoción, preguntá por ella
- Siempre en MAYÚSCULAS para promo y extra
- El title debe ser elegante y corto (2-3 palabras max)
- Combiná promociones relacionadas en un solo texto impactante`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.2 }
    });

    const text = response.text || '';
    let jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(jsonStr) as ExtractedTexts;
    
    logger.info(`✅ Texts extracted from: "${userInput}"`);
    logger.info(`   - Title: ${parsed.title}`);
    logger.info(`   - Subtitle: ${parsed.subtitle}`);
    logger.info(`   - Promo: ${parsed.promo}`);
    logger.info(`   - Extra: ${parsed.extra}`);

    return parsed;

  } catch (error) {
    logger.error('Error extracting texts:', error);
    // Return defaults based on product
    return {
      title: productType || 'Producto',
      subtitle: '',
      promo: '',
      extra: ''
    };
  }
}

