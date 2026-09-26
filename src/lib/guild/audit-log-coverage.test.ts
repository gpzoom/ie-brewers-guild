import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every session-authenticated member-mutation file that writes tables
 * directly must call recordAuditLogIfImpersonating after its write(s) --
 * the Member Admin plan's Decision 2: the practical, checked substitute for
 * a Postgres-trigger-level guarantee. Deliberately excludes
 * creator-upload.server.ts, ics-refresh-cron.server.ts, and
 * hours-stale-cron.server.ts, which run entirely on the service-role
 * client with no user session and are never reachable from an
 * impersonated request.
 *
 * Phase 2 (drafts) removed the per-editor live-write files (basics fields,
 * hours, carousel, cover, social image, links, discount, theme, publish /
 * unpublish). Those edits now go through src/lib/drafts/drafts.server.ts,
 * which only calls the SQL draft functions -- and those audit a Guild
 * admin's writes themselves, against the real actor
 * (_draft_audit_if_guild_admin, 20260925200700_member_draft_internals.sql;
 * unpublish_member, 20260925210000_unpublish_member.sql). The second test
 * below keeps that file honest: no direct table writes that would bypass
 * the SQL audit.
 */
const MEMBER_MUTATION_FILES = [
  // updateMemberType: member type isn't drafted, still a live write.
  "src/lib/members/member-basics.server.ts",
  "src/lib/media/media-gallery.server.ts",
  // The upload itself (media_assets row) is live; the draft logo is set via SQL.
  "src/lib/media/logo.server.ts",
  "src/lib/media/upload-tokens.server.ts",
  "src/lib/media/review-tray.server.ts",
  "src/lib/events/events.server.ts",
  "src/lib/events/calendar-connection.server.ts",
  // The portal's People actions (service-role writes) and type-change requests.
  "src/lib/portal/portal-people.server.ts",
  "src/lib/portal/type-change.server.ts",
];

describe("audit-log coverage", () => {
  it.each(MEMBER_MUTATION_FILES)("%s calls recordAuditLogIfImpersonating", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf-8");
    expect(source).toContain("recordAuditLogIfImpersonating");
  });

  it("drafts.server.ts writes only through the (self-auditing) SQL draft functions", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/drafts/drafts.server.ts"), "utf-8");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    for (const fn of [
      "save_member_draft_section",
      "publish_member_draft",
      "discard_member_draft_sections",
      "unpublish_member",
    ]) {
      expect(source).toContain(`rpc("${fn}"`);
    }
  });
});
