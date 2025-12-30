/**
 * Reference Analyzer Service
 * Extracts design resources from a chosen reference image
 */

import * as fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import * as logger from '../utils/logger';

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return apiKey;
}

export interface DesignResources {
  lighting: {
    type: string;          // "natural", "studio", "golden hour", etc.
    direction: string;     // "frontal", "lateral", "backlit", etc.
    mood: string;          // "warm", "cool", "neutral", etc.
  };
  composition: {
    angle: string;         // "eye level", "low angle", "high angle", etc.
    framing: string;       // "full body", "half body", "close up", etc.
    subjectPosition: string; // "center", "rule of thirds", etc.
  };
  environment: {
    setting: string;       // "yacht", "cafe", "street", etc.
    background: string;    // Description of background
    props: string[];       // Notable props in the scene
  };
  style: {
    aesthetic: string;     // "old money", "minimalist", etc.
    colorPalette: string[]; // Main colors
    mood: string;          // Overall mood/feeling
  };
  person: {
    present: boolean;
    gender: string | null;
    pose: string | null;
    expression: string | null;
    styling: string | null;
  };
  textPlacement: {
    topArea: boolean;      // Is top area good for text?
    bottomArea: boolean;   // Is bottom area good for text?
    suggestedZones: string[];
  };
  promptSuggestion: string; // Suggested prompt to generate similar image
}

export async function analyzeReference(imagePath: string): Promise<DesignResources> {
  const apiKey = requireGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  // Read image
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  
  const prompt = `Analiza esta imagen de referencia para recrear un post similar.

RESPONDE SOLO JSON VÁLIDO, sin markdown ni explicaciones:

{
  "lighting": {
    "type": "tipo de iluminación (natural, studio, golden hour, artificial)",
    "direction": "dirección de luz (frontal, lateral, backlit, overhead)",
    "mood": "mood de luz (warm, cool, neutral, dramatic)"
  },
  "composition": {
    "angle": "ángulo de cámara (eye level, low angle, high angle, dutch angle)",
    "framing": "encuadre (full body, half body, close up, medium shot)",
    "subjectPosition": "posición del sujeto (center, rule of thirds left/right, off-center)"
  },
  "environment": {
    "setting": "escenario principal (yacht, cafe, street, studio, beach, etc.)",
    "background": "descripción breve del fondo",
    "props": ["lista", "de", "props", "notables"]
  },
  "style": {
    "aesthetic": "estética general (old money, minimalist, urban, vibrant, elegant)",
    "colorPalette": ["color1", "color2", "color3"],
    "mood": "mood/sensación general"
  },
  "person": {
    "present": true/false,
    "gender": "male/female/null si no hay persona",
    "pose": "descripción de la pose o null",
    "expression": "expresión facial o null",
    "styling": "estilo de vestimenta o null"
  },
  "textPlacement": {
    "topArea": true/false - si el área superior es buena para texto,
    "bottomArea": true/false - si el área inferior es buena para texto,
    "suggestedZones": ["top", "bottom", o ambos]
  },
  "promptSuggestion": "Un prompt detallado para generar una imagen similar pero única. Incluye todos los detalles de ambiente, iluminación, pose, estilo. NO incluyas texto en el prompt."
}

Sé muy específico y detallado. El promptSuggestion debe ser lo suficientemente detallado para recrear el estilo pero permitir variaciones.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { data: imageBase64, mimeType: 'image/png' } }
          ]
        }
      ],
      config: { temperature: 0.3 }
    });

    const text = response.text || '';
    // Clean JSON
    let jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(jsonStr) as DesignResources;
    
    logger.info(`✅ Reference analyzed:`);
    logger.info(`   - Style: ${parsed.style.aesthetic}`);
    logger.info(`   - Setting: ${parsed.environment.setting}`);
    logger.info(`   - Person: ${parsed.person.present ? `${parsed.person.gender}, ${parsed.person.pose}` : 'No'}`);

    return parsed;

  } catch (error) {
    logger.error('Error analyzing reference:', error);
    // Return defaults
    return {
      lighting: { type: 'natural', direction: 'frontal', mood: 'warm' },
      composition: { angle: 'eye level', framing: 'full body', subjectPosition: 'center' },
      environment: { setting: 'outdoor', background: 'clean background', props: [] },
      style: { aesthetic: 'elegant', colorPalette: ['neutral', 'white', 'beige'], mood: 'sophisticated' },
      person: { present: true, gender: 'male', pose: 'standing', expression: 'confident', styling: 'smart casual' },
      textPlacement: { topArea: true, bottomArea: true, suggestedZones: ['top', 'bottom'] },
      promptSuggestion: 'Professional lifestyle product photo with elegant aesthetic'
    };
  }
}

/**
 * Build a generation prompt from design resources and user context
 */
export function buildPromptFromResources(
  resources: DesignResources,
  productDescription: string,
  userContext: string
): string {
  const parts: string[] = [
    `Create a ${resources.style.aesthetic} style product photo.`,
    '',
    `PRODUCT: ${productDescription}`,
    `USER REQUEST: ${userContext}`,
    '',
    `ENVIRONMENT:`,
    `- Setting: ${resources.environment.setting}`,
    `- Background: ${resources.environment.background}`,
    resources.environment.props.length > 0 ? `- Props: ${resources.environment.props.join(', ')}` : '',
    '',
    `LIGHTING:`,
    `- Type: ${resources.lighting.type}`,
    `- Direction: ${resources.lighting.direction}`,
    `- Mood: ${resources.lighting.mood}`,
    '',
    `COMPOSITION:`,
    `- Angle: ${resources.composition.angle}`,
    `- Framing: ${resources.composition.framing}`,
    `- Subject position: ${resources.composition.subjectPosition}`,
    '',
    `STYLE:`,
    `- Aesthetic: ${resources.style.aesthetic}`,
    `- Color palette: ${resources.style.colorPalette.join(', ')}`,
    `- Mood: ${resources.style.mood}`,
  ];

  if (resources.person.present) {
    parts.push(
      '',
      `PERSON:`,
      `- Gender: ${resources.person.gender}`,
      `- Pose: ${resources.person.pose}`,
      `- Expression: ${resources.person.expression}`,
      `- Styling: ${resources.person.styling}`
    );
  }

  parts.push(
    '',
    `IMPORTANT: Create a UNIQUE image inspired by this style, not an exact copy.`,
    `The product must be clearly visible and be the star of the image.`,
    `DO NOT include any text in the generated image.`
  );

  return parts.filter(p => p !== '').join('\n');
}

