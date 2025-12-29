import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as logger from '../utils/logger';

const GEMINI_MODEL = 'gemini-2.0-flash';

interface ChatRequest {
  userMessage: string;
  conversationHistory: string[];
  currentData: {
    style: string;
    scene: string;
    sceneDescription: string; // Full description of the scene
    text: string;
    textFormat: string; // How user wants text formatted (e.g., "50% OFF grande, ENVIO GRATIS chico")
    format: string;
    extraDetails: string;
  };
  initialText?: string;
}

interface ChatResponse {
  nextQuestion: string;
  extractedData: Partial<ChatRequest['currentData']>;
  isReadyToGenerate: boolean;
}

export default async function geminiChatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/gemini-chat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as ChatRequest;
      const { userMessage, conversationHistory, currentData, initialText } = body;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY not set');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const systemPrompt = `Sos un asistente de Postty que ayuda a crear imágenes promocionales para Instagram.
Tu trabajo es tener una conversación natural para entender qué quiere el usuario.

DATOS ACTUALES RECOPILADOS:
- Estilo: ${currentData.style || '(no definido)'}
- Escena: ${currentData.scene || '(no definido)'}
- Descripción de escena: ${currentData.sceneDescription || '(no definido)'}
- Texto: ${currentData.text || initialText || '(no definido)'}
- Formato del texto: ${currentData.textFormat || '(no definido)'}
- Formato imagen: ${currentData.format || '(no definido)'}

HISTORIAL DE CONVERSACIÓN:
${conversationHistory.slice(-6).join('\n')}

ÚLTIMO MENSAJE DEL USUARIO: "${userMessage}"

INSTRUCCIONES:
1. Analiza el mensaje del usuario y extrae información sobre:
   - style: estilo visual (elegante/old-money, minimalista, vibrante, urbano, natural, moderno)
   - scene: tipo de escena (con-persona, solo-producto, lifestyle, fondo-simple)
   - sceneDescription: DESCRIPCIÓN COMPLETA Y DETALLADA de la escena. Ejemplo: "Una persona elegante usando el producto en una calle de Italia"
   - text: texto para la imagen (puede ser vacío si dice "sin texto")
   - textFormat: cómo quiere el usuario que se vea el texto. Ejemplo: "50% OFF grande arriba, ENVIO GRATIS más chico abajo"
   - format: formato de imagen (1:1 para post cuadrado, 9:16 para story vertical)

2. IMPORTANTE: Cuando el usuario describe la escena, CAPTURA TODOS los detalles en sceneDescription.

3. FLUJO DE PREGUNTAS - Seguir este orden:
   a. Primero: ¿Qué estilo querés? (si no tenemos style)
   b. Segundo: ¿Cómo querés la escena? ¿Con persona, solo producto? ¿Dónde? (si no tenemos sceneDescription)
   c. Tercero: ¿Para feed (cuadrado) o stories (vertical)? (si no tenemos format)
   d. Cuarto: Si hay texto con múltiples partes (ej: "50% OFF + ENVIO GRATIS"), preguntar: "¿Cómo querés el texto? Por ejemplo: '50% OFF' bien grande y 'ENVIO GRATIS' más chico abajo, o todo del mismo tamaño?"
   e. Quinto: Confirmar todo y preguntar si generamos

4. Si el usuario confirma (dice "dale", "generar", "si", "perfecto", "listo") Y tenemos style + sceneDescription + format, marca isReadyToGenerate como true.

5. Genera respuestas NATURALES y CORTAS (máximo 2 oraciones).

RESPONDE SOLO CON JSON VÁLIDO (sin markdown):
{
  "nextQuestion": "tu respuesta natural al usuario",
  "extractedData": {
    "style": "valor si lo detectaste o null",
    "scene": "valor si lo detectaste o null",
    "sceneDescription": "descripción completa de la escena o null",
    "text": "valor si lo detectaste o null",
    "textFormat": "descripción de cómo quiere el texto o null",
    "format": "1:1 o 9:16 o null"
  },
  "isReadyToGenerate": false
}`;

      const result = await model.generateContent(systemPrompt);
      const response = result.response;
      const text = response.text();

      // Parse JSON from response
      let parsed: ChatResponse;
      try {
        // Remove markdown code blocks if present
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleanText);
      } catch (e) {
        logger.warn('Failed to parse Gemini response, using fallback');
        parsed = {
          nextQuestion: "¿Podés contarme más sobre cómo querés la imagen?",
          extractedData: {},
          isReadyToGenerate: false,
        };
      }

      // Clean up extracted data (remove nulls)
      const cleanedData: Partial<ChatRequest['currentData']> = {};
      if (parsed.extractedData) {
        for (const [key, value] of Object.entries(parsed.extractedData)) {
          if (value && value !== 'null' && value !== null) {
            cleanedData[key as keyof ChatRequest['currentData']] = value;
          }
        }
      }

      return reply.send({
        nextQuestion: parsed.nextQuestion || "¿Qué más te gustaría ajustar?",
        extractedData: cleanedData,
        isReadyToGenerate: parsed.isReadyToGenerate || false,
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Gemini chat error:', errorMsg);
      
      return reply.send({
        nextQuestion: "Perdón, ¿podés repetirme eso?",
        extractedData: {},
        isReadyToGenerate: false,
      });
    }
  });

  logger.info('✅ Gemini chat route registered: /gemini-chat');
}

