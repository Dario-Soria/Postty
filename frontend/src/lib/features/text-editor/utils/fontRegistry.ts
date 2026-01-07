/**
 * Font Registry
 * Available fonts for text editor
 */

export interface FontOption {
  name: string;
  family: string;
  weights: string[];
}

/**
 * Available fonts in the editor
 * These should be loaded via next/font/google
 */
export const AVAILABLE_FONTS: FontOption[] = [
  {
    name: 'Inter',
    family: 'Inter',
    weights: ['400', '500', '600', '700', '800', '900'],
  },
  {
    name: 'Roboto',
    family: 'Roboto',
    weights: ['400', '500', '700', '900'],
  },
  {
    name: 'Montserrat',
    family: 'Montserrat',
    weights: ['400', '500', '600', '700', '800', '900'],
  },
  {
    name: 'Playfair Display',
    family: 'Playfair Display',
    weights: ['400', '500', '600', '700', '800', '900'],
  },
  {
    name: 'Oswald',
    family: 'Oswald',
    weights: ['400', '500', '600', '700'],
  },
  {
    name: 'Arial',
    family: 'Arial',
    weights: ['400', '700'],
  },
  {
    name: 'Helvetica',
    family: 'Helvetica',
    weights: ['400', '700'],
  },
  {
    name: 'Georgia',
    family: 'Georgia',
    weights: ['400', '700'],
  },
];

/**
 * Get font family CSS string
 */
export function getFontFamilyCSS(fontName: string): string {
  const font = AVAILABLE_FONTS.find(f => f.name === fontName);
  return font ? `${font.family}, sans-serif` : 'Inter, sans-serif';
}

/**
 * Default font
 */
export const DEFAULT_FONT = AVAILABLE_FONTS[0];

