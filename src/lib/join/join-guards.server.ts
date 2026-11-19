import { getRequestHeader } from "@tanstack/react-start/server";
import { SOMETHING_WRONG, TOO_MANY_TRIES, isJoinOpenValue } from "@/lib/join/join-messages";

/**
 * Helpers shared by the public Join server functions (join.server.ts and
 * join-preview.server.ts). Kept in their own file, with no createServerFn,
 * so nothing here is ever reachable from the client bundle. The messages
 * live in join-messages.ts so the page can recognize them.
 */

export { JOIN_BUSY, JOIN_CLOSED, SOMETHING_WRONG, TOO_MANY_TRIES } from "@/lib/join/join-messages";

type RateLimiter = { limit: (opts: { key: string }) => Promise<{ success: boolean }> };

/**
 * Reuses the creator-upload limiter under its own key namespace (as the
 * contact form does). FAILS CLOSED: this is the only abuse guard on a public
 * endpoint, so a missing binding refuses rather than allowing everything.
 * Returns a message to show, or null when the request may go ahead.
 */
export async function rateLimitMessage(
  namespace: "join-submit" | "join-search" | "tapcard-activate" | "tapcard-signin" | "tapcard-card" | "tapcard-join",
): Promise<string | null> {
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

/**
 * Ruling R11: public Join is open only when the JOIN_OPEN Worker var is
 * exactly "true". Absent or anything else is closed (the default on staging
 * and live until the owner opens it). /join/finish and the admin fill are
 * not gated.
 */
export async function isJoinOpen(): Promise<boolean> {
  const { env } = await import("cloudflare:workers");
  return isJoinOpenValue((env as { JOIN_OPEN?: unknown }).JOIN_OPEN);
}

export const collapse = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
