/**
 * Adapter functions to convert between backend and editor formats
 */

import type {
  BackendTextLayout,
  EditableTextOverlay,
  TextContent,
} from '../types';

/**
 * Convert backend text layout to editable overlays
 */
export function layoutToOverlays(
  textLayout: BackendTextLayout
): EditableTextOverlay[] {
  return textLayout.elements.map((el, idx) => ({
    id: `text-${idx}-${Date.now()}`,
    text: el.text,
    type: el.type,
    
    // Position (already in 0-100 format from backend)
    x: el.position.x,
    y: el.position.y,
    
    // Default transform values
    scale: 1.0,
    rotation: 0,
    
    // Typography
    fontFamily: el.style.fontFamily || 'Inter',
    fontSize: el.style.fontSize,
    fontWeight: el.style.fontWeight || '400',
    color: el.style.color,
    align: el.position.anchor,
    
    // Optional
    maxWidth: el.style.maxWidth,
    letterSpacing: el.style.letterSpacing,
  }));
}

/**
 * Convert editable overlays back to text content for API
 */
export function overlaysToTextContent(
  overlays: EditableTextOverlay[]
): TextContent {
  const result: TextContent = {};
  
  overlays.forEach(overlay => {
    if (overlay.type === 'headline' && overlay.text.trim()) {
      result.headline = overlay.text.trim();
    }
    if (overlay.type === 'subheadline' && overlay.text.trim()) {
      result.subheadline = overlay.text.trim();
    }
    if (overlay.type === 'cta' && overlay.text.trim()) {
      result.cta = overlay.text.trim();
    }
  });
  
  return result;
}

/**
 * Convert overlays to backend layout format (for regeneration)
 */
export function overlaysToBackendLayout(
  overlays: EditableTextOverlay[]
): BackendTextLayout {
  return {
    elements: overlays.map(overlay => ({
      text: overlay.text,
      type: overlay.type,
      position: {
        x: overlay.x,
        y: overlay.y,
        anchor: overlay.align,
      },
      style: {
        fontFamily: overlay.fontFamily,
        fontSize: overlay.fontSize * overlay.scale, // Apply scale to font size
        fontWeight: overlay.fontWeight,
        color: overlay.color,
        letterSpacing: overlay.letterSpacing,
        maxWidth: overlay.maxWidth,
      },
    })),
  };
}

