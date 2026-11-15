import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Helpers shared by the public Join server functions (join.server.ts and
 * join-preview.server.ts). Kept in their own file, with no createServerFn,
 * so nothing here is ever reachable from the client bundle.
 */

export const TOO_MANY_TRIES = "Too many tries — please wait a minute and try again.";
export const SOMETHING_WRONG = "Something went wrong. Try again in a moment.";

type RateLimiter = { limit: (opts: { key: string }) => Promise<{ success: boolean }> };

/**
 * Reuses the creator-upload limiter under its own key namespace (as the
 * contact form does). FAILS CLOSED: this is the only abuse guard on a public
 * endpoint, so a missing binding refuses rather than allowing everything.
 * Returns a message to show, or null when the request may go ahead.
 */
export async function rateLimitMessage(namespace: "join-submit" | "join-search"): Promise<string | null> {
  const { env } = await import("cloudflare:workers");
  const limiter = (env as { CREATOR_UPLOAD_RATE_LIMITER?: RateLimiter }).CREATOR_UPLOAD_RATE_LIMITER;
  if (!limiter) {
    console.error(`${namespace}: CREATOR_UPLOAD_RATE_LIMITER binding is missing -- refusing the request.`);
    return SOMETHING_WRONG;
  }
  const clientIp = getRequestHeader("CF-Connecting-IP") ?? "unknown";
  const { success } = await limiter.limit({ key: `${namespace}:${clientIp}` });
  return success ? null : TOO_MANY_TRIES;
}

export const collapse = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
