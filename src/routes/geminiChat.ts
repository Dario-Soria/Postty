import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as logger from '../utils/logger';

const GEMINI_MODEL = 'gemini-2.0-flash';

interface ChatRequest {
  userMessage: string;
  conversationHistory: string[];
  currentData: {
    // Block 1: Scene context
    sceneContext: string;        // Full scene description in one answer
    sceneConfirmed: boolean;     // User said "no more details"
    
    // Block 2: Template texts
    templateShown: boolean;      // We've shown the template
    text1: string;               // First text slot (e.g., product name)
    text2: string;               // Second text slot (e.g., brand)
    text3: string;               // Third text slot (e.g., promo)
    text4: string;               // Fourth text slot (e.g., extra)
    currentTextSlot: number;     // Which slot we're asking for (1-4)
    
    // Block 3: Format
    format: string;              // 1:1 or 9:16
    
    // Derived
    style: string;               // Extracted from context
  };
}

interface ChatResponse {
  nextQuestion: string;
  extractedData: Partial<ChatRequest['currentData']>;
  isReadyToGenerate: boolean;
  showTemplate?: boolean;        // Signal to frontend to show template image
}

export default async function geminiChatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/gemini-chat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as ChatRequest;
      const { userMessage, conversationHistory, currentData } = body;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY not set');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      // Determine current phase based on data
      const phase = !currentData.sceneContext ? 'SCENE_ASK' :
                    !currentData.sceneConfirmed ? 'SCENE_CONFIRM' :
                    !currentData.templateShown ? 'SHOW_TEMPLATE' :
                    currentData.currentTextSlot <= 4 && !currentData.text4 ? 'ASK_TEXTS' :
                    !currentData.format ? 'ASK_FORMAT' : 'READY';

      const systemPrompt = `Sos un asistente de Postty que ayuda a crear imágenes promocionales.
Tu trabajo es guiar al usuario paso a paso, de forma NATURAL y AMIGABLE.

═══════════════════════════════════════════════════════════════
ESTADO ACTUAL:
═══════════════════════════════════════════════════════════════
- Fase actual: ${phase}
- Contexto de escena: ${currentData.sceneContext || '(pendiente)'}
- Escena confirmada: ${currentData.sceneConfirmed ? 'SÍ' : 'NO'}
- Template mostrado: ${currentData.templateShown ? 'SÍ' : 'NO'}
- Texto 1: ${currentData.text1 || '(pendiente)'}
- Texto 2: ${currentData.text2 || '(pendiente)'}
- Texto 3: ${currentData.text3 || '(pendiente)'}
- Texto 4: ${currentData.text4 || '(pendiente)'}
- Slot actual: ${currentData.currentTextSlot || 1}
- Formato: ${currentData.format || '(pendiente)'}

HISTORIAL:
${conversationHistory.slice(-4).join('\n')}

MENSAJE DEL USUARIO: "${userMessage}"

═══════════════════════════════════════════════════════════════
FLUJO POR BLOQUES (seguir estrictamente):
═══════════════════════════════════════════════════════════════

📍 BLOQUE 1: ESCENA (una sola pregunta abierta)
Si no tenemos sceneContext:
→ Pregunta: "Contame todo sobre la imagen: ¿qué estilo querés? ¿Con persona o solo producto? ¿En qué lugar o ambiente?"
→ Extraé TODO lo que diga el usuario en "sceneContext"
→ Detectá el estilo (old-money, elegante, minimalista, vibrante, urbano) y guardalo en "style"

Si tenemos sceneContext pero NO sceneConfirmed:
→ Responde: "Perfecto, voy a crear [resumen de lo que dijo]. ¿Querés agregar algún detalle más o así está bien?"
→ Si dice "está bien", "no", "asi", "dale" → sceneConfirmed = true
→ Si agrega algo → actualizá sceneContext

📍 BLOQUE 2: TEMPLATE (preguntar textos uno por uno)
Si sceneConfirmed pero NO templateShown:
→ Responde: "Genial! Ahora vamos con los textos. Tengo un template con 4 espacios para texto."
→ showTemplate = true, templateShown = true

Si templateShown y currentTextSlot = 1 y no tenemos text1:
→ Pregunta: "📝 Texto 1 (arriba, el título del producto): ¿qué ponemos?"
→ Cuando responda → text1 = respuesta, currentTextSlot = 2

Si currentTextSlot = 2 y no tenemos text2:
→ Pregunta: "📝 Texto 2 (subtítulo o marca): ¿qué ponemos? (podés decir 'nada' si no querés)"
→ Cuando responda → text2 = respuesta (o ""), currentTextSlot = 3

Si currentTextSlot = 3 y no tenemos text3:
→ Pregunta: "📝 Texto 3 (promoción grande, ej: 30% OFF): ¿qué ponemos?"
→ Cuando responda → text3 = respuesta, currentTextSlot = 4

Si currentTextSlot = 4 y no tenemos text4:
→ Pregunta: "📝 Texto 4 (extra abajo, ej: ENVÍO GRATIS): ¿qué ponemos? (podés decir 'nada')"
→ Cuando responda → text4 = respuesta (o ""), currentTextSlot = 5

📍 BLOQUE 3: FORMATO
Si tenemos todos los textos pero no format:
→ Pregunta: "¿Para feed (cuadrado) o stories (vertical)?"
→ Cuando responda → format = "1:1" o "9:16"

📍 BLOQUE 4: CONFIRMAR
Si tenemos TODO:
→ Muestra resumen y pregunta "¿Generamos?"
→ Si confirma → isReadyToGenerate = true

═══════════════════════════════════════════════════════════════
RESPONDE SOLO JSON (sin markdown):
{
  "nextQuestion": "tu respuesta natural",
  "extractedData": {
    "sceneContext": "todo lo que dijo sobre la escena o null",
    "sceneConfirmed": true/false o null,
    "style": "old-money/elegante/minimalista/vibrante/urbano o null",
    "templateShown": true/false o null,
    "text1": "texto o null",
    "text2": "texto o null", 
    "text3": "texto o null",
    "text4": "texto o null",
    "currentTextSlot": numero 1-5 o null,
    "format": "1:1 o 9:16 o null"
  },
  "isReadyToGenerate": false,
  "showTemplate": false
}`;

      const result = await model.generateContent(systemPrompt);
      const response = result.response;
      const text = response.text();

      // Parse JSON from response
      let parsed: ChatResponse;
      try {
        // Remove markdown code blocks if present
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        // Find JSON in response
        const jsonStart = cleanText.indexOf('{');
        const jsonEnd = cleanText.lastIndexOf('}');
        const jsonStr = cleanText.slice(jsonStart, jsonEnd + 1);
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        logger.warn('Failed to parse Gemini response, using fallback');
        parsed = {
          nextQuestion: "Contame: ¿qué estilo querés? ¿Con persona o solo producto? ¿En qué ambiente?",
          extractedData: {},
          isReadyToGenerate: false,
        };
      }

      // Clean up extracted data (remove nulls and "null" strings)
      const cleanedData: Partial<ChatRequest['currentData']> = {};
      if (parsed.extractedData) {
        for (const [key, value] of Object.entries(parsed.extractedData)) {
          if (value !== null && value !== 'null' && value !== undefined) {
            // Handle boolean values
            if (typeof value === 'boolean') {
              (cleanedData as any)[key] = value;
            }
            // Handle numbers
            else if (typeof value === 'number') {
              (cleanedData as any)[key] = value;
            }
            // Handle non-empty strings
            else if (typeof value === 'string' && value.trim() !== '') {
              (cleanedData as any)[key] = value;
            }
          }
        }
      }

      logger.info(`📝 Chat phase, extracted: ${JSON.stringify(cleanedData)}`);

      return reply.send({
        nextQuestion: parsed.nextQuestion || "¿Qué más te gustaría ajustar?",
        extractedData: cleanedData,
        isReadyToGenerate: parsed.isReadyToGenerate || false,
        showTemplate: parsed.showTemplate || false,
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

