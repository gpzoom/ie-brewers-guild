/**
 * Inland Scan Pass codes. Each card's NFC chip and QR code hold
 * `${site}/p/<code>`, and the code is printed on the card as XXXX-XXXX.
 * Crockford base32: no I, L, O or U, so a code read aloud or typed from the
 * card can't be confused. 8 characters = 40 random bits.
 */
export const CARD_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CARD_CODE_LENGTH = 8;

export function generateCardCode(): string {
  // 32 symbols divide 256 evenly, so taking the low 5 bits of each random
  // byte is uniform without rejection.
  const bytes = new Uint8Array(CARD_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += CARD_CODE_ALPHABET[byte & 31];
  return code;
}

/** What people type or a link carries → the stored code, or null. */
export function normalizeCardCode(input: string): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (cleaned.length !== CARD_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CARD_CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

export function formatCardCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function cardUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/p/${code}`;
}
