export type SupportedLanguage = 'es' | 'en';

export function detectLanguageFromText(text: string): SupportedLanguage {
  const message = (text || '').trim();
  const m = message.toLowerCase();
  const hasSpanishChars = /[áéíóúñü¿¡]/i.test(message);
  const spanishHints = [
    ' en español',
    ' español',
    ' castellano',
    ' idioma',
    ' por favor',
    ' gracias',
    ' quiero',
    ' necesito',
    ' oferta',
    ' descuento',
    ' tienda',
    ' sorte',
    ' gimnasio',
    ' padre',
  ];
  const score = spanishHints.reduce((acc, s) => (m.includes(s) ? acc + 1 : acc), 0);
  if (hasSpanishChars || score >= 2) return 'es';
  return 'en';
}

export function isLikelySpanishText(text: string): boolean {
  return detectLanguageFromText(text) === 'es';
}


