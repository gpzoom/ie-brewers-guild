export type UrlValidation = { valid: true } | { valid: false; reason: string };

/**
 * Whether `value` parses as a genuine http(s) URL -- the one check that
 * actually stops stored-XSS via a `javascript:` (or `data:`, `vbscript:`,
 * any other non-http(s)) scheme landing in a real `<a href>`. Kept pure and
 * framework-free specifically so it can run at BOTH ends of member_links'
 * one genuinely dangerous write path (the `url` column, which has no
 * scheme/format constraint at the database level):
 *
 *  - the write boundary (member-links.server.ts's upsertMemberLink,
 *    before a row is ever inserted/updated), and
 *  - the render boundary (LinkPills.tsx, the PUBLIC-facing component that
 *    turns a stored `url` into a real, clickable anchor for every visitor
 *    to a published member's page).
 *
 * Neither check alone is enough -- same lesson this project already
 * learned from calendar_connections.ics_url (see
 * calendar-connection.server.ts's validateIcsUrl/syncOneIcsConnection doc
 * comments): a signed-in member has direct Supabase REST access to their
 * own member_links rows via RLS, so a bad scheme can reach `url` through a
 * request that never goes through upsertMemberLink at all -- and a future
 * write path (a Guild-admin tool, a CSV import elsewhere in this plan, a
 * direct API call) could bypass a single write-only checkpoint the same
 * way. Only the render-time check protects every visitor regardless of how
 * the bad value actually got into the row, which is why it lives here as
 * its own shared, importable function rather than only inline in the
 * server handler.
 */
export function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Write-boundary wrapper around isHttpUrl with a member-facing error
 * message -- same `{valid} | {valid: false, reason}` shape as
 * calendar-connection.server.ts's validateIcsUrl, deliberately not reused
 * verbatim since that one's wording is calendar-specific ("the calendar
 * URL"). Kept separate from isHttpUrl itself so the render boundary
 * (LinkPills.tsx) can use the plain boolean without needing to unpack (or
 * discard) a `reason` string it never displays to a site visitor.
 */
export function validateLinkUrl(url: string): UrlValidation {
  if (!isHttpUrl(url)) {
    return { valid: false, reason: "That link must start with http:// or https://." };
  }
  return { valid: true };
}
