/**
 * Client-safe UUID generator.
 *
 * Why: `crypto.randomUUID()` is only available in secure contexts (HTTPS / localhost).
 * When you open the dev server via LAN IP over `http://192.168.x.x:3000`, some
 * browsers expose `crypto` but *not* `crypto.randomUUID`, causing runtime crashes.
 */
export function uuid(): string {
  // Prefer native if available.
  try {
    const c: any = typeof crypto !== "undefined" ? (crypto as any) : undefined;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();

    // RFC4122 v4 via getRandomValues.
    if (c && typeof c.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);

      // Set version (4) and variant (10xx).
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return (
        hex.slice(0, 4).join("") +
        "-" +
        hex.slice(4, 6).join("") +
        "-" +
        hex.slice(6, 8).join("") +
        "-" +
        hex.slice(8, 10).join("") +
        "-" +
        hex.slice(10, 16).join("")
      );
    }
  } catch {
    // Fall through to non-crypto fallback.
  }

  // Last-resort (non-cryptographic) fallback.
  return `t${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}${Math.random()
    .toString(16)
    .slice(2)}`;
}

