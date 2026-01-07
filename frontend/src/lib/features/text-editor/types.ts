/**
 * Text Editor Types
 * Defines all data structures for the interactive text editor
 */

/**
 * Editable text overlay - internal editor format
 */
export interface EditableTextOverlay {
  id: string;
  text: string;
  type: 'headline' | 'subheadline' | 'cta' | 'body';
  
  // Transform (canvas percentage coordinates 0-100)
  x: number;           // X position (0-100%)
  y: number;           // Y position (0-100%)
  scale: number;       // Scale multiplier (0.5-3.0)
  rotation: number;    // Rotation in degrees
  
  // Typography
  fontFamily: string;
  fontSize: number;    // Base font size in pixels
  fontWeight: string;  // '400', '500', '600', '700', '800', '900'
  color: string;       // Hex color
  align: 'left' | 'center' | 'right';
  
  // Optional
  maxWidth?: number;   // Max width as % of canvas
  letterSpacing?: number;
}

/**
 * Editor state
 */
export interface TextEditorState {
  baseImageUrl: string;
  canvasSize: { width: number; height: number };
  overlays: EditableTextOverlay[];
  selectedId: string | null;
  history: {
    past: EditableTextOverlay[][];
    future: EditableTextOverlay[][];
  };
}

/**
 * Backend text layout format (from /api/pipeline response)
 */
export interface BackendTextLayout {
  elements: Array<{
    text: string;
    type: 'headline' | 'subheadline' | 'cta' | 'body';
    position: {
      x: number;
      y: number;
      anchor: 'left' | 'center' | 'right';
    };
    style: {
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      color: string;
      letterSpacing?: number;
      lineHeight?: number;
      textTransform?: string;
      maxWidth?: number;
      shadow?: {
        color: string;
        blur: number;
        offsetX: number;
        offsetY: number;
      };
      background?: {
        color: string;
        paddingX: number;
        paddingY: number;
        borderRadius: number;
      };
    };
  }>;
  theme?: 'light' | 'dark';
}

/**
 * Text content format (for backend API)
 */
export interface TextContent {
  headline?: string;
  subheadline?: string;
  cta?: string;
}

/**
 * Editor modal input parameters
 */
export interface TextEditorParams {
  baseImageUrl: string;
  textLayout: BackendTextLayout;
}

/**
 * Editor modal result
 */
export interface TextEditorResult {
  textContent: TextContent;
  overlays: EditableTextOverlay[];
}

/**
 * Transform handle type
 */
export type HandleType = 'rotate' | 'scale-tl' | 'scale-tr' | 'scale-bl' | 'scale-br';

/**
 * Canvas mapping utility
 */
export interface CanvasMapping {
  imageRect: DOMRect;
  canvasSize: { width: number; height: number };
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  canvasToScreen: (canvasX: number, canvasY: number) => { x: number; y: number };
}

