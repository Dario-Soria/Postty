/**
 * Heuristics to detect when the user explicitly wants to keep their uploaded image
 * essentially unaltered (no scene/background replacement). In that case we should
 * skip Pixabay enrichment and avoid generative re-rendering.
 *
 * This is intentionally conservative: it only triggers on clear phrasing.
 */
export function wantsUnalteredUploadedImage(prompt: string): boolean {
  const p = (prompt || '').toLowerCase();

  // English signals
  const english = [
    'use this image',
    'use the uploaded image',
    'use my image',
    'use my photo',
    'use the photo i uploaded',
    'keep the image as is',
    'keep it as is',
    "don't change the image",
    'do not change the image',
    'unaltered',
    'unchanged',
    'no changes',
    'without changing',
    'only add text',
    'just add text',
    'add text on top',
    'put text on top',
    'overlay text',
    'add a caption on the image',
    'add a text overlay',
  ];

  // Spanish signals (common)
  const spanish = [
    'usa esta imagen',
    'usa la imagen',
    'usa mi imagen',
    'usa mi foto',
    'mantén la imagen igual',
    'mantener la imagen igual',
    'sin cambiar la imagen',
    'no cambies la imagen',
    'no cambiar la imagen',
    'sin cambios',
    'solo agrega texto',
    'solo añadir texto',
    'solo pon texto',
    'poner texto encima',
    'agrega texto encima',
    'texto superpuesto',
  ];

  const hits = [...english, ...spanish];
  return hits.some((k) => p.includes(k));
}


