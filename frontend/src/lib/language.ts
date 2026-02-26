export type SupportedLanguage = "en" | "es" | "pt";

export function normalizePreferredLanguage(value?: string | null): SupportedLanguage | null {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("pt")) return "pt";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function detectBrowserLanguage(): SupportedLanguage {
  if (typeof navigator === "undefined") return "en";
  const candidate =
    normalizePreferredLanguage(navigator.language) ||
    normalizePreferredLanguage((navigator.languages || [])[0]) ||
    "en";
  return candidate;
}
