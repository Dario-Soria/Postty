/**
 * Template Service
 * Manages text templates for reference images
 * Templates define EXACT positions, fonts, sizes, colors for text
 */

import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';

export interface TextSlot {
  id: string;
  label: string;  // Human-readable label for the chat
  position: {
    x: number;  // 0-100 percentage
    y: number;
    anchor: 'left' | 'center' | 'right';
  };
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    fontStyle?: 'normal' | 'italic';
    color: string;
    letterSpacing: number;
    lineHeight: number;
    textTransform: 'uppercase' | 'lowercase' | 'none';
    shadow: {
      color: string;
      blur: number;
      offsetX: number;
      offsetY: number;
    };
  };
}

export interface Template {
  name: string;
  description: string;
  style: string;
  textSlots: TextSlot[];
  preview: Record<string, string>;
}

export interface TemplateWithImage {
  template: Template;
  imagePath: string;
  imageBase64?: string;
}

const REFERENCE_DIR = path.join(process.cwd(), 'reference-images');

/**
 * Load a template JSON for a reference image
 */
export function loadTemplate(imagePath: string): Template | null {
  const templatePath = imagePath.replace(/\.(png|jpg|jpeg|webp)$/i, '.template.json');
  
  if (!fs.existsSync(templatePath)) {
    logger.warn(`No template found for: ${imagePath}`);
    return null;
  }
  
  try {
    const content = fs.readFileSync(templatePath, 'utf-8');
    return JSON.parse(content) as Template;
  } catch (e) {
    logger.error(`Failed to load template: ${templatePath}`, e);
    return null;
  }
}

/**
 * List all available templates with their reference images
 */
export function listTemplates(): TemplateWithImage[] {
  const templates: TemplateWithImage[] = [];
  
  if (!fs.existsSync(REFERENCE_DIR)) {
    return templates;
  }
  
  // Scan all style folders
  const styleFolders = fs.readdirSync(REFERENCE_DIR)
    .filter(name => {
      const fullPath = path.join(REFERENCE_DIR, name);
      return fs.statSync(fullPath).isDirectory();
    });
  
  for (const folder of styleFolders) {
    const folderPath = path.join(REFERENCE_DIR, folder);
    const files = fs.readdirSync(folderPath);
    
    // Find images that have templates
    const images = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    
    for (const image of images) {
      const imagePath = path.join(folderPath, image);
      const template = loadTemplate(imagePath);
      
      if (template) {
        // Read image as base64 for preview
        const imageBuffer = fs.readFileSync(imagePath);
        const imageBase64 = imageBuffer.toString('base64');
        
        templates.push({
          template,
          imagePath,
          imageBase64,
        });
        
        logger.info(`📋 Found template: ${template.name} (${folder}/${image})`);
      }
    }
  }
  
  logger.info(`📋 Total templates found: ${templates.length}`);
  return templates;
}

/**
 * Get a specific template by style and index
 */
export function getTemplate(style: string, index: number = 0): TemplateWithImage | null {
  const templates = listTemplates();
  const filtered = templates.filter(t => 
    t.template.style.toLowerCase() === style.toLowerCase()
  );
  
  if (filtered.length === 0) {
    logger.warn(`No templates found for style: ${style}`);
    return null;
  }
  
  return filtered[index] || filtered[0];
}

/**
 * Apply user text to a template
 * Returns elements ready for the compositor
 */
export function applyTextToTemplate(
  template: Template,
  userTexts: Record<string, string>  // { "top-title": "Mi Producto", "bottom-promo": "50% OFF" }
): Array<{
  text: string;
  type: 'headline' | 'subheadline' | 'cta' | 'body';
  position: { x: number; y: number; anchor: 'left' | 'center' | 'right' };
  style: TextSlot['style'];
}> {
  const elements: Array<{
    text: string;
    type: 'headline' | 'subheadline' | 'cta' | 'body';
    position: { x: number; y: number; anchor: 'left' | 'center' | 'right' };
    style: TextSlot['style'];
  }> = [];
  
  for (const slot of template.textSlots) {
    const userText = userTexts[slot.id];
    
    if (userText && userText.trim()) {
      // Determine type based on slot position/id
      let type: 'headline' | 'subheadline' | 'cta' | 'body' = 'body';
      if (slot.id.includes('title') || slot.id.includes('promo')) {
        type = 'headline';
      } else if (slot.id.includes('subtitle') || slot.id.includes('extra')) {
        type = 'subheadline';
      }
      
      elements.push({
        text: userText,
        type,
        position: slot.position,
        style: slot.style,
      });
      
      logger.info(`📝 Applied text to slot "${slot.id}": "${userText}"`);
    }
  }
  
  return elements;
}

/**
 * Generate chat prompts for a template's text slots
 */
export function getTemplatePrompts(template: Template): string[] {
  return template.textSlots.map(slot => 
    `📝 ${slot.label}:`
  );
}

/**
 * Format template info for chat display
 */
export function formatTemplateForChat(templateWithImage: TemplateWithImage): {
  name: string;
  description: string;
  slots: Array<{ id: string; label: string; example: string }>;
  imageBase64: string;
} {
  const { template, imageBase64 } = templateWithImage;
  
  return {
    name: template.name,
    description: template.description,
    slots: template.textSlots.map(slot => ({
      id: slot.id,
      label: slot.label,
      example: template.preview[`slot${template.textSlots.indexOf(slot) + 1}`] || '',
    })),
    imageBase64: imageBase64 || '',
  };
}

