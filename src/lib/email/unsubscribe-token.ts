import { fromBase64Url, hmacSign, timingSafeEqual, toBase64Url } from "../crypto/hmac";

/**
 * Stateless, no-expiry unsubscribe token for broadcast email. Payload is
 * `unsubscribe:<userId>`, so it can never be mistaken for an hours token
 * (those carry `<memberId>.<expiry>`) even though they share a secret.
 */
const PREFIX = "unsubscribe:";

export async function signUnsubscribeToken(userId: string, secret: string): Promise<string> {
  const payload = `${PREFIX}${userId}`;
  const signature = await hmacSign(secret, payload);
  return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(signature)}`;
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<{ valid: true; userId: string } | { valid: false }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return { valid: false };
    const payload = new TextDecoder().decode(fromBase64Url(parts[0]));
    const provided = fromBase64Url(parts[1]);
    if (!payload.startsWith(PREFIX)) return { valid: false };
    const expected = await hmacSign(secret, payload);
    if (!timingSafeEqual(expected, provided)) return { valid: false };
    const userId = payload.slice(PREFIX.length);
    if (!userId) return { valid: false };
    return { valid: true, userId };
  } catch {
    return { valid: false };
  }
}
