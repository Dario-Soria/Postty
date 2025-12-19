type RewriteResult = { rewritten: string; changed: boolean; note: string | null };

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Minimal, targeted rewrite to avoid common safety blocks while preserving intent.
 * Only used AFTER an image-merge attempt is blocked by the safety system.
 */
export function rewritePromptForSafeMerge(original: string): RewriteResult {
  const input = original || '';
  const lower = input.toLowerCase();
  let out = input;
  let changed = false;

  // Spanish: avoid “shirtless” phrasing.
  const spanishTriggers: Array<[RegExp, string]> = [
    [/\bsin\s+remera(s)?\b/gi, 'con camiseta deportiva sin mangas'],
    [/\bsin\s+camiseta(s)?\b/gi, 'con camiseta deportiva sin mangas'],
    [/\bsin\s+camisa(s)?\b/gi, 'con camiseta deportiva sin mangas'],
    [/\btorso\s+desnudo\b/gi, 'con ropa deportiva'],
    [/\bdesnudo(s|a)?\b/gi, 'con ropa deportiva'],
    [/\btopless\b/gi, 'con ropa deportiva'],
  ];

  // English triggers.
  const englishTriggers: Array<[RegExp, string]> = [
    [/\bshirtless\b/gi, 'wearing sleeveless athletic tank tops'],
    [/\btopless\b/gi, 'wearing athletic clothing'],
    [/\bnude\b/gi, 'wearing athletic clothing'],
    [/\bminimal\s+clothing\b/gi, 'winter sportswear'],
    [/\blingerie\b/gi, 'winter sportswear'],
    [/\bskimpy\b/gi, 'winter sportswear'],
  ];

  const patterns = lower.includes(' sin ') || /[áéíóúñü¿¡]/i.test(input) ? spanishTriggers : englishTriggers;
  for (const [re, replacement] of patterns) {
    if (re.test(out)) {
      out = out.replace(re, replacement);
      changed = true;
    }
  }

  out = normalizeSpaces(out);
  const note = changed
    ? 'Ajusté una parte del texto para poder integrar tu producto sin que el modelo lo bloquee.'
    : null;
  return { rewritten: out, changed, note };
}

export function isOpenAiImageSafetyBlock(err: unknown): boolean {
  const anyErr = err as any;
  const msg =
    typeof anyErr?.message === 'string'
      ? anyErr.message
      : typeof anyErr?.error?.message === 'string'
        ? anyErr.error.message
        : '';
  if (!msg) return false;
  return (
    msg.toLowerCase().includes('rejected by the safety system') ||
    msg.toLowerCase().includes('safety_violations') ||
    msg.toLowerCase().includes('safety violation') ||
    msg.toLowerCase().includes('content policy')
  );
}


