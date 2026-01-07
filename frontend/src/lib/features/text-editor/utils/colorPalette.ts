/**
 * Color Palette
 * Preset colors for text editor
 */

export interface ColorOption {
  name: string;
  hex: string;
}

/**
 * Predefined color palette
 */
export const COLOR_PALETTE: ColorOption[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Black', hex: '#000000' },
  { name: 'Sky Blue', hex: '#38BDF8' },
  { name: 'Cyan', hex: '#22D3EE' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Fuchsia', hex: '#E879F9' },
  { name: 'Rose', hex: '#FB7185' },
  { name: 'Amber', hex: '#FBBF24' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Red', hex: '#EF4444' },
];

/**
 * Get contrasting color (white or black) for background
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

