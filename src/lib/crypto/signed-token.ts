/** A payload plus its HMAC-SHA256 signature, base64url: `<payload>.<signature>`. No storage needed. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function signToken(payload: string, secret: string): Promise<string> {
  return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(await hmac(secret, payload))}`;
}
export async function verifyToken(token: string, secret: string): Promise<string | null> {
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  try {
    const payload = new TextDecoder().decode(fromBase64Url(p));
    return equal(fromBase64Url(s), await hmac(secret, payload)) ? payload : null;
  } catch {
    return null;
  }
}
