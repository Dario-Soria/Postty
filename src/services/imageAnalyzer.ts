import * as fs from 'fs';
import OpenAI from 'openai';
import * as logger from '../utils/logger';

/**
 * Analyzes an image using GPT-4 Vision to extract relevant visual context
 * @param imagePath - Local file path to the image to analyze
 * @returns A description of the image's visual elements suitable for enhancing DALL-E prompts
 */
export async function analyzeImageWithVision(imagePath: string): Promise<string> {
  // Validate OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  // Check if file exists
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  try {
    logger.info(`Analyzing image with GPT-4 Vision: ${imagePath}`);

    // Read the image file and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Determine the mime type based on file extension
    const extension = imagePath.toLowerCase().split('.').pop();
    let mimeType = 'image/jpeg';
    if (extension === 'png') {
      mimeType = 'image/png';
    } else if (extension === 'webp') {
      mimeType = 'image/webp';
    } else if (extension === 'gif') {
      mimeType = 'image/gif';
    }

    // Call GPT-4 Vision API with a specialized prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image in detail for the purpose of creating marketing content. Describe:
- The main subject/product and its key features
- Colors, lighting, and overall mood
- Composition and visual style
- Any text, branding, or distinctive elements
- The context or setting

Keep your description concise but comprehensive (2-3 sentences), focusing on elements that would be useful for generating a related marketing image.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    const analysis = response.choices[0]?.message?.content;
    if (!analysis) {
      throw new Error('No analysis returned from GPT-4 Vision');
    }

    logger.info(`Image analysis completed: ${analysis.substring(0, 100)}...`);
    return analysis;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to analyze image with GPT-4 Vision:', errorMsg);
    throw new Error(`Image analysis failed: ${errorMsg}`);
  }
}

