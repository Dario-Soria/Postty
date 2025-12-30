/**
 * Reference Search Service
 * Searches and indexes reference images by keywords
 */

import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';

const REFERENCES_DIR = path.join(process.cwd(), 'reference-images');

export interface ReferenceImage {
  id: string;
  style: string;
  path: string;
  templatePath: string | null;
  keywords: string[];
  metadata: {
    name: string;
    description: string;
  };
  previewBase64?: string;
}

// In-memory index of references
let referenceIndex: ReferenceImage[] = [];
let indexLoaded = false;

/**
 * Load and index all reference images
 */
export function loadReferenceIndex(): ReferenceImage[] {
  if (indexLoaded && referenceIndex.length > 0) {
    return referenceIndex;
  }

  referenceIndex = [];
  
  if (!fs.existsSync(REFERENCES_DIR)) {
    logger.warn('Reference images directory not found');
    return referenceIndex;
  }

  const styleDirs = fs.readdirSync(REFERENCES_DIR).filter(f => {
    const fullPath = path.join(REFERENCES_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });

  for (const style of styleDirs) {
    const styleDir = path.join(REFERENCES_DIR, style);
    const files = fs.readdirSync(styleDir);
    
    // Find image files (not templates)
    const imageFiles = files.filter(f => 
      /\.(png|jpg|jpeg|webp)$/i.test(f) && !f.includes('.template')
    );

    for (const imageFile of imageFiles) {
      const imagePath = path.join(styleDir, imageFile);
      const baseName = imageFile.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      const templateFile = `${baseName}.template.json`;
      const templatePath = files.includes(templateFile) 
        ? path.join(styleDir, templateFile) 
        : null;

      // Load template metadata if exists
      let metadata = { name: `${style} - ${baseName}`, description: '' };
      let keywords: string[] = [style];
      
      if (templatePath && fs.existsSync(templatePath)) {
        try {
          const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
          metadata.name = template.name || metadata.name;
          metadata.description = template.description || '';
          if (template.keywords) {
            keywords = [...keywords, ...template.keywords];
          }
        } catch (e) {
          // Ignore template parse errors
        }
      }

      // Add style-based keywords
      const styleKeywords = getStyleKeywords(style);
      keywords = [...new Set([...keywords, ...styleKeywords])];

      referenceIndex.push({
        id: `${style}/${baseName}`,
        style,
        path: imagePath,
        templatePath,
        keywords,
        metadata
      });
    }
  }

  indexLoaded = true;
  logger.info(`📚 Loaded ${referenceIndex.length} reference images`);
  return referenceIndex;
}

/**
 * Get keywords associated with a style
 */
function getStyleKeywords(style: string): string[] {
  const styleMap: Record<string, string[]> = {
    'old-money': ['elegante', 'lujo', 'sofisticado', 'premium', 'yate', 'nautico', 'clasico', 'hombre', 'mujer', 'lifestyle'],
    'elegante': ['elegante', 'formal', 'sofisticado', 'premium', 'gala', 'evento'],
    'minimalista': ['minimalista', 'limpio', 'simple', 'moderno', 'producto'],
    'moderno': ['moderno', 'contemporaneo', 'trend', 'actual', 'joven'],
    'urbano': ['urbano', 'street', 'ciudad', 'casual', 'joven', 'dinamico'],
    'vibrante': ['vibrante', 'colorido', 'energico', 'promocion', 'oferta', 'llamativo']
  };
  
  return styleMap[style.toLowerCase()] || [style];
}

/**
 * Search references by keywords
 * Returns top N matches sorted by relevance
 */
export function searchReferences(
  searchKeywords: string[], 
  limit: number = 3
): ReferenceImage[] {
  const index = loadReferenceIndex();
  
  if (index.length === 0) {
    logger.warn('No references indexed');
    return [];
  }

  // Normalize search keywords
  const normalizedSearch = searchKeywords.map(k => k.toLowerCase().trim());

  // Score each reference
  const scored = index.map(ref => {
    let score = 0;
    const normalizedRefKeywords = ref.keywords.map(k => k.toLowerCase());
    
    for (const searchKey of normalizedSearch) {
      for (const refKey of normalizedRefKeywords) {
        // Exact match
        if (refKey === searchKey) {
          score += 10;
        }
        // Partial match
        else if (refKey.includes(searchKey) || searchKey.includes(refKey)) {
          score += 5;
        }
      }
      
      // Check style match
      if (ref.style.toLowerCase().includes(searchKey)) {
        score += 8;
      }
      
      // Check metadata
      if (ref.metadata.name.toLowerCase().includes(searchKey)) {
        score += 3;
      }
      if (ref.metadata.description.toLowerCase().includes(searchKey)) {
        score += 2;
      }
    }

    return { ref, score };
  });

  // Sort by score and return top N
  const sorted = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // If not enough matches, add random references
  if (sorted.length < limit) {
    const remaining = limit - sorted.length;
    const usedIds = new Set(sorted.map(s => s.ref.id));
    const available = index.filter(r => !usedIds.has(r.id));
    
    // Shuffle and take remaining
    const shuffled = available.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(remaining, shuffled.length); i++) {
      sorted.push({ ref: shuffled[i], score: 0 });
    }
  }

  logger.info(`🔍 Found ${sorted.length} references for keywords: ${normalizedSearch.join(', ')}`);
  
  return sorted.map(s => s.ref);
}

/**
 * Get a reference with its preview image as base64
 */
export function getReferenceWithPreview(refId: string): ReferenceImage | null {
  const index = loadReferenceIndex();
  const ref = index.find(r => r.id === refId);
  
  if (!ref) return null;
  
  try {
    const imageBuffer = fs.readFileSync(ref.path);
    ref.previewBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  } catch (e) {
    logger.warn(`Could not load preview for ${refId}`);
  }
  
  return ref;
}

/**
 * Get multiple references with previews
 */
export function getReferencesWithPreviews(refs: ReferenceImage[]): ReferenceImage[] {
  return refs.map(ref => {
    try {
      const imageBuffer = fs.readFileSync(ref.path);
      return {
        ...ref,
        previewBase64: `data:image/png;base64,${imageBuffer.toString('base64')}`
      };
    } catch (e) {
      return ref;
    }
  });
}

