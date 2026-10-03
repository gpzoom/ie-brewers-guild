/**
 * The allowlist for sign-in's `next` destination (spec, "Getting in": check
 * `next` against a short allowlist of internal paths so it can't be used as
 * an open redirect). Only the Member Portal is allowed: "/portal" itself or
 * a path under "/portal/".
 *
 * Rules, in order:
 *  - Anything that isn't a string, or is longer than 200 characters, is
 *    dropped.
 *  - A query string or hash is stripped (everything from the first "?" or
 *    "#"). The portal doesn't need either, and not carrying them over means
 *    nothing attacker-shaped can ride along after an allowed path.
 *  - The path must be made only of plain segments -- letters, digits, "-"
 *    and "_" -- under "/portal". That single character set rules out "//",
 *    backslashes, a scheme ("https:"), dot segments ("/portal/../x"),
 *    whitespace and control characters.
 *  - Percent-encoding is not allowed at all: the value is decoded once and
 *    must come out unchanged. So "%2F%2Fevil.com" or "/portal%2F..%2F" can't
 *    sneak past a check made on the encoded form and turn into something
 *    else after a later decode.
 *  - One trailing slash is tolerated and removed ("/portal/" → "/portal").
 *
 * Returns the cleaned path, or undefined for anything that isn't allowed --
 * callers then behave exactly as if no `next` had been given.
 */
const MAX_LENGTH = 200;
const PORTAL_PATH = /^\/portal(?:\/[A-Za-z0-9_-]+)*$/;

export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return undefined;

  const cut = value.search(/[?#]/);
  let path = cut === -1 ? value : value.slice(0, cut);

  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  if (decoded !== path) return undefined;

  if (path.length > "/portal".length && path.endsWith("/")) path = path.slice(0, -1);

  return PORTAL_PATH.test(path) ? path : undefined;
}
