/**
 * Agent Prompt Builder
 * 
 * Reads the prompt template from prompt-template-section.md and builds
 * a complete Gemini prompt by replacing variables with actual values.
 * 
 * This simulates how the agent would generate prompts dynamically from
 * its prompt.md file, rather than using hardcoded templates in TypeScript.
 */

import * as fs from 'fs';
import * as path from 'path';

interface TextElement {
  text: string;
  typography: string;
  weight: string;
  case?: string;
  color: string;
  position: string;
  size: string;
  alignment: string;
  letterSpacing?: string;
  spacing?: string;
}

interface PromptParams {
  userDescription: string;
  framingType: string;
  outfitDescription: string;
  productDescription: string;
  locationDescription: string;
  moodDescription: string;
  lightingDescription: string;
  depthDescription: string;
  sceneType: string;
  textElements: TextElement[];
  productColors: string[];
  aspectRatio: string;
}

export class AgentPromptBuilder {
  private templateContent: string;

  constructor(templatePath?: string) {
    const defaultPath = path.join(process.cwd(), 'test', 'prompt-template-section.md');
    const templateFile = templatePath || defaultPath;
    
    if (!fs.existsSync(templateFile)) {
      throw new Error(`Template file not found: ${templateFile}`);
    }
    
    this.templateContent = fs.readFileSync(templateFile, 'utf-8');
  }

  /**
   * Extract the template section from the markdown file
   */
  private extractTemplate(): string {
    // Find the "COMPLETE PROMPT STRUCTURE" section
    const startMarker = '## COMPLETE PROMPT STRUCTURE';
    const endMarker = '---\n\n## VARIABLE PLACEHOLDERS';
    
    const startIdx = this.templateContent.indexOf(startMarker);
    const endIdx = this.templateContent.indexOf(endMarker);
    
    if (startIdx === -1 || endIdx === -1) {
      throw new Error('Could not find template markers in prompt-template-section.md');
    }
    
    return this.templateContent.substring(startIdx, endIdx).trim();
  }

  /**
   * Format text elements for the prompt
   */
  private formatTextElements(elements: TextElement[]): string {
    return elements.map((elem, idx) => {
      let formatted = `\nText ${idx + 1}: "${elem.text}"\n`;
      formatted += `- Typography: ${elem.typography}\n`;
      formatted += `- Weight: ${elem.weight}\n`;
      if (elem.case) {
        formatted += `- Case: ${elem.case}\n`;
      }
      formatted += `- Color: ${elem.color}\n`;
      formatted += `- Vertical Position: ${elem.position} from top edge\n`;
      if (elem.spacing) {
        formatted += `- Spacing: ${elem.spacing} gap from headline above\n`;
      }
      formatted += `- Size: ${elem.size} (relative to canvas)\n`;
      formatted += `- Alignment: ${elem.alignment}\n`;
      if (elem.letterSpacing) {
        formatted += `- Letter Spacing: ${elem.letterSpacing}\n`;
      }
      return formatted;
    }).join('\n');
  }

  /**
   * Build the complete prompt by replacing all placeholders
   */
  buildCompletePrompt(params: PromptParams): string {
    // Start with a clean template
    let prompt = `TASK: Create a promotional image with TEXT OVERLAY.

INPUTS:
1. REFERENCE IMAGE: Use for style inspiration - match the color palette, lighting mood, and especially the TYPOGRAPHY STYLE
   
2. PRODUCT IMAGE: Study this product carefully and RECREATE it in the scene. DO NOT paste or overlay this image. Generate a photorealistic version of this product integrated naturally into the scene.

CRITICAL: The product image is PROVIDED AS REFERENCE ONLY. You must GENERATE the product in the scene, not paste the original image. The product should look like it belongs in the scene naturally.

USER REQUEST: ${params.userDescription}

SCENE COMPOSITION:
- Frame: ${params.framingType}
- Subject wearing: ${params.outfitDescription}
- Product (hero): ${params.productDescription}
- Setting: ${params.locationDescription}
- Mood: ${params.moodDescription}
- Lighting: ${params.lightingDescription}
- Depth of field: ${params.depthDescription}
- Padding: 10-15% at top/bottom to prevent cropping
- Text space: Top 20% clear for text overlay

SCENE: ${params.sceneType}

TEXT OVERLAY REQUIREMENTS:
🚨 CRITICAL: You MUST include text overlays in the generated image. Text is not optional.

Generate the following text directly rendered into the image:
${this.formatTextElements(params.textElements)}

PRODUCT DOMINANT COLORS: ${params.productColors.join(', ')}
IMPORTANT: Ensure text has excellent contrast against the background. If the product or background uses similar colors to the text, adjust the text color or add subtle shadows/outlines for readability.

TYPOGRAPHY MATCHING INSTRUCTIONS:
🎯 CRITICAL: Study the REFERENCE IMAGE typography in extreme detail and REPLICATE it precisely:

1. FONT CHARACTERISTICS:
   - Analyze the exact letter forms, stroke weights, and character shapes in the reference
   - Match the font style (serif/sans-serif/script/display) AND the character mood (elegant/bold/luxury/etc.)
   - If reference shows script fonts, determine if they're elegant calligraphic vs casual brush style
   - If reference shows serif, note if they're traditional, modern, or decorative

2. POSITIONING & SPACING:
   - Match the vertical positioning EXACTLY - measure where text sits in the reference
   - Maintain the same spacing between headline and subheadline as shown in reference
   - Preserve the relationship between text and other elements (person, product, background)

3. VISUAL INTEGRATION:
   - Text should look like it belongs in the scene, not just overlaid
   - Match how the reference integrates text with imagery
   - If reference shows text with effects (shadows, outlines), replicate those
   - Text must be crisp, clear, and highly readable

4. HIERARCHY & SCALE:
   - Maintain the same size relationships between text elements as the reference
   - Headline should dominate with the same visual weight as reference
   - Subheadline should have similar relative sizing

🚨 The specifications above describe the reference typography - use them to MATCH the reference style precisely.

🚨 TEXT SPELLING ACCURACY - CRITICAL:
⚠️ PERFECT SPELLING IS MANDATORY: Each word MUST be rendered with 100% accurate spelling, letter by letter.
- Before generating, mentally spell out each word character-by-character
- Double-check EVERY letter in EVERY word before finalizing
- Pay special attention to Spanish characters: ñ, á, é, í, ó, ú
- Common mistakes to avoid:
  * Mixing 'j' and 'h' sounds (e.g., "agujeros" has 'j', not 'h')
  * Missing or wrong letters in middle of words (e.g., "hermana" not "harmana")
  * Confusing similar-looking letters (e.g., 'o' vs '0', 'l' vs 'I')
- VERIFICATION STEP: After rendering text, verify spelling matches EXACTLY what was specified above

🚨 TEXT GENERATION IS MANDATORY: The output image MUST contain the specified text overlays. Do not generate an image without text.

OUTPUT REQUIREMENTS:
- ${params.aspectRatio} aspect ratio
- Photorealistic, high quality
- Product must be clearly visible and featured (but GENERATED, not pasted from product image)
- Professional advertising quality with text integrated naturally
- Text should be crisp, clear, and readable
- VERIFY: All specified text elements are present and visible in the output
`;

    return prompt;
  }
}

// Example usage for testing
if (require.main === module) {
  const builder = new AgentPromptBuilder();
  
  const exampleParams: PromptParams = {
    userDescription: "Professional fashion photography. A sophisticated woman wearing black leather knee-high boots with buckles (the hero product) from the user's uploaded image, sitting gracefully on a pristine green tennis court, reading a newspaper. The composition is calm and luxurious.",
    framingType: "Full-length shot",
    outfitDescription: "white elegant dress",
    productDescription: "black leather knee-high boots with buckles",
    locationDescription: "pristine green tennis court",
    moodDescription: "elegant, serene ambiance, in line with a luxurious and calm mood",
    lightingDescription: "Soft, warm natural lighting",
    depthDescription: "Shallow depth of field",
    sceneType: "Clean product photography with minimal background",
    textElements: [
      {
        text: 'Botas "el Uli',
        typography: 'serif elegant (thin strokes, flowing style)',
        weight: 'regular',
        case: 'title-case',
        color: 'black',
        position: '40%',
        size: 'large',
        alignment: 'center',
        letterSpacing: 'normal',
      },
      {
        text: '50% off en toda la tienda',
        typography: 'script elegant',
        weight: 'regular',
        color: 'black',
        position: '45%',
        size: 'medium',
        alignment: 'center',
        letterSpacing: 'normal',
        spacing: 'tight (5-10%)',
      },
    ],
    productColors: ['#F6F4EF', '#2E2F31', '#B2B1AE'],
    aspectRatio: '1:1',
  };
  
  console.log('='.repeat(80));
  console.log('AGENT PROMPT BUILDER - TEST');
  console.log('='.repeat(80));
  console.log();
  
  const prompt = builder.buildCompletePrompt(exampleParams);
  
  console.log('Generated Prompt:');
  console.log('-'.repeat(80));
  console.log(prompt);
  console.log('-'.repeat(80));
  console.log();
  console.log(`Prompt length: ${prompt.length} characters`);
}

