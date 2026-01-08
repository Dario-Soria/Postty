/**
 * Prompt Template Reader
 * 
 * Reads the Gemini image generation prompt template from prompt.md
 * and fills in variables to create the complete prompt sent to Gemini.
 */

import * as fs from 'fs';
import * as path from 'path';

export class PromptTemplateReader {
  private templateCache: string | null = null;
  private readonly templatePath: string;

  constructor() {
    this.templatePath = path.join(
      process.cwd(),
      'Agents',
      'Product Showcase',
      'prompt.md'
    );
  }

  /**
   * Load template from prompt.md
   * Caches result for performance
   */
  private loadTemplate(): string {
    if (this.templateCache) {
      return this.templateCache;
    }

    const content = fs.readFileSync(this.templatePath, 'utf-8');
    
    const startMarker = 'TASK: Create a promotional image with TEXT OVERLAY.';
    const endMarker = '---\n\nTEMPLATE VARIABLES (filled by backend):';
    
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    
    if (startIdx === -1) {
      throw new Error('Template not found in prompt.md');
    }
    
    if (endIdx === -1) {
      throw new Error('Template end marker not found in prompt.md - looking for "TEMPLATE VARIABLES (filled by backend):"');
    }
    
    this.templateCache = content.substring(startIdx, endIdx).trim();
    
    return this.templateCache;
  }

  /**
   * Build complete Gemini prompt by filling template variables
   */
  buildPrompt(variables: {
    userIntent: string;
    sceneDescription?: string;
    textElements: string;
    productColors: string;
    aspectRatio: string;
  }): string {
    let template = this.loadTemplate();
    
    console.log('[PromptTemplateReader] Template loaded, length:', template.length);
    console.log('[PromptTemplateReader] Text elements to inject:', variables.textElements.substring(0, 200));
    
    // Replace all placeholders
    template = template.replace('{{USER_INTENT}}', variables.userIntent);
    template = template.replace('{{SCENE_DESCRIPTION}}', variables.sceneDescription || '');
    template = template.replace('{{TEXT_ELEMENTS}}', variables.textElements);
    template = template.replace('{{PRODUCT_COLORS}}', variables.productColors);
    template = template.replace('{{ASPECT_RATIO}}', variables.aspectRatio);
    
    console.log('[PromptTemplateReader] After replacement, prompt length:', template.length);
    console.log('[PromptTemplateReader] Contains "Text 1:":', template.includes('Text 1:'));
    console.log('[PromptTemplateReader] Contains "TYPOGRAPHY MATCHING":', template.includes('TYPOGRAPHY MATCHING'));
    
    return template;
  }

  /**
   * Clear template cache (useful for development/testing)
   */
  clearCache(): void {
    this.templateCache = null;
  }
}

/**
 * Singleton instance
 */
let instance: PromptTemplateReader | null = null;

/**
 * Get or create the singleton PromptTemplateReader instance
 */
export function getPromptTemplateReader(): PromptTemplateReader {
  if (!instance) {
    instance = new PromptTemplateReader();
  }
  return instance;
}

