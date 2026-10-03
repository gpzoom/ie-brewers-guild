/**
 * Stateless, HMAC-signed one-click hours-confirmation token (spec: "the
 * link itself sets the timestamp, no login"). No new database row needed
 * -- a signed token carries everything the confirm route needs to verify
 * (this plan's Decision 16).
 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacSign(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signHoursConfirmToken(memberId: string, secret: string, now: Date = new Date()): Promise<string> {
  const expiresAtMs = now.getTime() + TOKEN_TTL_MS;
  const payload = `${memberId}.${expiresAtMs}`;
  const signature = await hmacSign(secret, payload);
  return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(signature)}`;
}

export async function verifyHoursConfirmToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<{ valid: true; memberId: string } | { valid: false; reason: string }> {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "Malformed token." };
  const [payloadPart, signaturePart] = parts;

  let payload: string;
  let providedSignature: Uint8Array;
  try {
    payload = new TextDecoder().decode(fromBase64Url(payloadPart));
    providedSignature = fromBase64Url(signaturePart);
  } catch {
    // atob() throws a raw DOMException on any character outside the
    // base64 alphabet -- this covers BOTH segments, not just the payload.
    // A plain-text email auto-linker routinely swallows trailing
    // punctuation (")", "!", ",", ";", ...) into a copy-pasted URL, which
    // lands here as a corrupted signature segment on an otherwise-valid
    // link. Without this, that's an unhandled exception on a fully public
    // endpoint (a raw 500 instead of a clean "this link isn't valid"
    // message) -- caught in review, reproduced live against a real built
    // Worker.
    return { valid: false, reason: "Malformed token." };
  }

  const expectedSignature = await hmacSign(secret, payload);
  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    return { valid: false, reason: "Invalid signature." };
  }

  const [memberId, expiresAtMsRaw] = payload.split(".");
  const expiresAtMs = Number(expiresAtMsRaw);
  if (!memberId || !Number.isFinite(expiresAtMs)) return { valid: false, reason: "Malformed token." };
  if (now.getTime() > expiresAtMs) return { valid: false, reason: "This link has expired." };

  return { valid: true, memberId };
}
