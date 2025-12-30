/**
 * Product Analyzer Service
 * Analyzes product images to identify type and suggest contextual post options
 */

import { GoogleGenAI } from '@google/genai';
import * as logger from '../utils/logger';

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

export interface ProductAnalysis {
  productType: string;           // "polo", "vestido", "zapatos", "bolso", etc.
  productCategory: string;       // "ropa", "calzado", "accesorios", etc.
  productDescription: string;    // Brief description of the product
  suggestedPostTypes: PostTypeSuggestion[];
  keywords: string[];           // Keywords for reference matching
}

export interface PostTypeSuggestion {
  id: string;
  name: string;
  description: string;
  followUpQuestion: string;
  suggestedStyles: string[];
}

// Post types contextualized by product category
const POST_TYPE_TEMPLATES: Record<string, PostTypeSuggestion[]> = {
  ropa: [
    {
      id: "lifestyle_model",
      name: "Lifestyle con modelo",
      description: "Mostrar la prenda en un modelo en un entorno aspiracional",
      followUpQuestion: "¿Qué estilo te gustaría? ¿Old money, urbano, casual, elegante? ¿En qué escenario?",
      suggestedStyles: ["old-money", "urbano", "elegante", "casual"]
    },
    {
      id: "product_showcase",
      name: "Producto destacado",
      description: "La prenda como protagonista con fondo limpio",
      followUpQuestion: "¿Querés un fondo minimalista, texturizado, o con elementos decorativos?",
      suggestedStyles: ["minimalista", "elegante", "moderno"]
    },
    {
      id: "promotional",
      name: "Promoción/Oferta",
      description: "Post promocional con descuento u oferta destacada",
      followUpQuestion: "¿Qué promoción querés destacar? (ej: 30% OFF, 3x2, envío gratis)",
      suggestedStyles: ["vibrante", "moderno", "elegante"]
    },
    {
      id: "new_arrival",
      name: "Nueva colección/llegada",
      description: "Anunciar un producto nuevo o colección",
      followUpQuestion: "¿Qué querés comunicar sobre este lanzamiento?",
      suggestedStyles: ["elegante", "moderno", "minimalista"]
    }
  ],
  calzado: [
    {
      id: "lifestyle_wearing",
      name: "En uso lifestyle",
      description: "Mostrar el calzado siendo usado en un entorno atractivo",
      followUpQuestion: "¿Qué ambiente querés? ¿Yate, ciudad, café, playa? ¿Modelo masculino o femenino?",
      suggestedStyles: ["old-money", "urbano", "elegante", "casual"]
    },
    {
      id: "product_detail",
      name: "Detalle del producto",
      description: "Close-up del calzado mostrando calidad y detalles",
      followUpQuestion: "¿Querés destacar algún detalle específico? ¿Material, diseño, color?",
      suggestedStyles: ["minimalista", "elegante"]
    },
    {
      id: "promotional",
      name: "Promoción/Oferta",
      description: "Post promocional con descuento",
      followUpQuestion: "¿Qué oferta querés comunicar?",
      suggestedStyles: ["vibrante", "moderno", "old-money"]
    },
    {
      id: "outfit_inspiration",
      name: "Inspiración de outfit",
      description: "El calzado como parte de un look completo",
      followUpQuestion: "¿Qué estilo de outfit querés mostrar?",
      suggestedStyles: ["old-money", "elegante", "urbano"]
    }
  ],
  accesorios: [
    {
      id: "lifestyle_using",
      name: "En uso",
      description: "El accesorio siendo usado por una persona",
      followUpQuestion: "¿En qué contexto querés mostrarlo? ¿Casual, formal, evento?",
      suggestedStyles: ["elegante", "old-money", "urbano"]
    },
    {
      id: "product_showcase",
      name: "Producto destacado",
      description: "El accesorio como protagonista",
      followUpQuestion: "¿Fondo minimalista o con elementos decorativos?",
      suggestedStyles: ["minimalista", "elegante", "moderno"]
    },
    {
      id: "promotional",
      name: "Promoción/Oferta",
      description: "Post promocional",
      followUpQuestion: "¿Qué promoción querés destacar?",
      suggestedStyles: ["vibrante", "elegante"]
    }
  ],
  default: [
    {
      id: "lifestyle",
      name: "Lifestyle",
      description: "El producto en un contexto de uso real",
      followUpQuestion: "¿En qué contexto querés mostrar el producto?",
      suggestedStyles: ["elegante", "moderno", "casual"]
    },
    {
      id: "product_showcase",
      name: "Producto destacado",
      description: "El producto como protagonista",
      followUpQuestion: "¿Qué estilo visual preferís?",
      suggestedStyles: ["minimalista", "elegante", "moderno"]
    },
    {
      id: "promotional",
      name: "Promoción",
      description: "Post promocional con oferta",
      followUpQuestion: "¿Qué querés promocionar?",
      suggestedStyles: ["vibrante", "moderno"]
    }
  ]
};

export async function analyzeProduct(imageBase64: string): Promise<ProductAnalysis> {
  const apiKey = requireGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Analiza esta imagen de producto para e-commerce/tienda online.

RESPONDE SOLO JSON VÁLIDO, sin explicaciones ni markdown:

{
  "productType": "string - tipo específico del producto (ej: polo, vestido, zapatos, bolso, reloj, gorra)",
  "productCategory": "string - una de: ropa, calzado, accesorios, otros",
  "productDescription": "string - descripción breve del producto (color, estilo, material visible)",
  "keywords": ["array", "de", "keywords", "para", "buscar", "referencias"]
}

KEYWORDS deben incluir:
- Tipo de producto
- Estilo sugerido (elegante, casual, deportivo, etc.)
- Ocasión de uso (formal, diario, fiesta, etc.)
- Género objetivo (hombre, mujer, unisex)

Sé específico y preciso.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }
          ]
        }
      ],
      config: { temperature: 0.3 }
    });

    const text = response.text || '';
    // Clean JSON from markdown
    let jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(jsonStr);
    
    // Get post types based on category
    const category = (parsed.productCategory || 'default').toLowerCase();
    const postTypes = POST_TYPE_TEMPLATES[category] || POST_TYPE_TEMPLATES.default;
    
    // Customize follow-up questions based on product type
    const customizedPostTypes = postTypes.map(pt => ({
      ...pt,
      followUpQuestion: pt.followUpQuestion.replace('{product}', parsed.productType)
    }));

    logger.info(`✅ Product analyzed: ${parsed.productType} (${parsed.productCategory})`);
    logger.info(`   Keywords: ${parsed.keywords?.join(', ')}`);

    return {
      productType: parsed.productType || 'producto',
      productCategory: parsed.productCategory || 'otros',
      productDescription: parsed.productDescription || '',
      suggestedPostTypes: customizedPostTypes,
      keywords: parsed.keywords || []
    };

  } catch (error) {
    logger.error('Error analyzing product:', error);
    // Return defaults
    return {
      productType: 'producto',
      productCategory: 'otros',
      productDescription: 'Producto de tienda',
      suggestedPostTypes: POST_TYPE_TEMPLATES.default,
      keywords: ['producto', 'tienda', 'ecommerce']
    };
  }
}

