/**
 * Coordinate Mapping Utilities
 * Converts between screen pixels and canvas percentages
 */

/**
 * Calculate the actual rendered image rect within a container
 * Accounts for object-fit: contain behavior
 */
export function calculateImageRect(
  containerWidth: number,
  containerHeight: number,
  imageNaturalWidth: number,
  imageNaturalHeight: number
): DOMRect {
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageNaturalWidth / imageNaturalHeight;
  
  let renderWidth: number;
  let renderHeight: number;
  let offsetX: number;
  let offsetY: number;
  
  if (imageAspect > containerAspect) {
    // Image is wider - fit to width
    renderWidth = containerWidth;
    renderHeight = containerWidth / imageAspect;
    offsetX = 0;
    offsetY = (containerHeight - renderHeight) / 2;
  } else {
    // Image is taller - fit to height
    renderHeight = containerHeight;
    renderWidth = containerHeight * imageAspect;
    offsetX = (containerWidth - renderWidth) / 2;
    offsetY = 0;
  }
  
  return new DOMRect(offsetX, offsetY, renderWidth, renderHeight);
}

/**
 * Canvas Mapper class
 * Handles coordinate transformations between screen and canvas space
 */
export class CanvasMapper {
  private imageRect: DOMRect;
  private canvasWidth: number;
  private canvasHeight: number;
  
  constructor(
    containerElement: HTMLElement,
    imageNaturalWidth: number,
    imageNaturalHeight: number
  ) {
    const containerRect = containerElement.getBoundingClientRect();
    this.imageRect = calculateImageRect(
      containerRect.width,
      containerRect.height,
      imageNaturalWidth,
      imageNaturalHeight
    );
    this.canvasWidth = imageNaturalWidth;
    this.canvasHeight = imageNaturalHeight;
  }
  
  /**
   * Convert screen coordinates to canvas percentage (0-100)
   */
  screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    const relativeX = screenX - this.imageRect.left;
    const relativeY = screenY - this.imageRect.top;
    
    const x = (relativeX / this.imageRect.width) * 100;
    const y = (relativeY / this.imageRect.height) * 100;
    
    return { x, y };
  }
  
  /**
   * Convert canvas percentage (0-100) to screen coordinates
   */
  canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } {
    const x = this.imageRect.left + (canvasX / 100) * this.imageRect.width;
    const y = this.imageRect.top + (canvasY / 100) * this.imageRect.height;
    
    return { x, y };
  }
  
  /**
   * Get the rendered image rect
   */
  getImageRect(): DOMRect {
    return this.imageRect;
  }
  
  /**
   * Convert percentage size to pixels
   */
  percentToPixels(percent: number, dimension: 'width' | 'height'): number {
    if (dimension === 'width') {
      return (percent / 100) * this.imageRect.width;
    }
    return (percent / 100) * this.imageRect.height;
  }
  
  /**
   * Convert pixels to percentage
   */
  pixelsToPercent(pixels: number, dimension: 'width' | 'height'): number {
    if (dimension === 'width') {
      return (pixels / this.imageRect.width) * 100;
    }
    return (pixels / this.imageRect.height) * 100;
  }
}

