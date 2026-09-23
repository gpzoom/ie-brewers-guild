/**
 * Creator upload token generation and hashing (spec, "The creator upload
 * link"). The raw token is shown to the member exactly once, embedded in
 * the /send/[token] URL they copy and send; only its hash is ever
 * persisted (upload_tokens.token_hash — schema's own comment: "store a
 * hash, never the raw token").
 */
export function generateUploadToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashUploadToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
