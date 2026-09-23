import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every session-authenticated member-mutation file from the Member Admin
 * phase must call recordAuditLogIfImpersonating after its write(s) --
 * this plan's Decision 2: the practical, checked substitute for a
 * Postgres-trigger-level guarantee. Deliberately excludes
 * creator-upload.server.ts, ics-refresh-cron.server.ts, and
 * hours-stale-cron.server.ts, which run entirely on the service-role
 * client with no user session and are never reachable from an
 * impersonated request.
 *
 * social-image.server.ts (Social Sharing Image feature, added after this
 * plan was originally written) is structurally identical to
 * cover.server.ts/logo.server.ts -- a session-authenticated file that
 * writes to the members table via getSupabaseServerClientForRequest() --
 * so it's included here as a 15th entry alongside the plan's original 14.
 */
const MEMBER_MUTATION_FILES = [
  "src/lib/members/member-basics.server.ts",
  "src/lib/hours/hours-editor.server.ts",
  "src/lib/media/media-gallery.server.ts",
  "src/lib/media/carousel.server.ts",
  "src/lib/media/cover.server.ts",
  "src/lib/media/logo.server.ts",
  "src/lib/media/upload-tokens.server.ts",
  "src/lib/media/review-tray.server.ts",
  "src/lib/hours/publish-gate.server.ts",
  "src/lib/theme/member-theme.server.ts",
  "src/lib/events/events.server.ts",
  "src/lib/events/calendar-connection.server.ts",
  "src/lib/links/member-links.server.ts",
  "src/lib/members/discount.server.ts",
  "src/lib/media/social-image.server.ts",
];

describe("audit-log coverage", () => {
  it.each(MEMBER_MUTATION_FILES)("%s calls recordAuditLogIfImpersonating", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf-8");
    expect(source).toContain("recordAuditLogIfImpersonating");
  });
});
