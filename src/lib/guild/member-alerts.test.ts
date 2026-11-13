import { describe, expect, it } from "vitest";
import { registerNotificationType } from "@/lib/notifications/registry";
import type { NotificationTypeDef } from "@/lib/notifications/types";
import {
  ALERT_EDIT_PATH,
  ageText,
  shapeMemberAlerts,
  type MemberAlertRow,
} from "./member-alerts";

const NOW = new Date("2026-11-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const hidden: NotificationTypeDef<Record<string, never>> = {
  type: "test_guild_hidden",
  kind: "problem",
  recipientRoles: ["owner"],
  guildSees: false,
  countsInGuildSummary: false,
  emailMode: "none",
  reminderDaysBefore: null,
  portal: () => ({ title: "Hidden", body: "", buttons: [] }),
  email: () => ({ heading: "", lines: [], button: null }),
};
registerNotificationType(hidden);

function row(over: Partial<MemberAlertRow> = {}): MemberAlertRow {
  return {
    id: "n1",
    type: "utc_calendar",
    kind: "problem",
    status: "open",
    quiet: false,
    member_id: "m1",
    event_id: null,
    details: { calendar_connection_id: "c1", purpose: "events", feed_time_zone: "UTC" },
    created_at: ago(3),
    resolved_at: null,
    read_at: null,
    ...over,
  };
}

const names = {
  members: new Map([
    ["m1", { name: "Sample Brewing", timezone: "America/Los_Angeles" }],
    ["m2", { name: "Sample Taproom", timezone: "America/Los_Angeles" }],
  ]),
  events: new Map([["e1", "Trivia Night"]]),
};

describe("shapeMemberAlerts", () => {
  it("labels a quiet row as found at launch", () => {
    const [r] = shapeMemberAlerts([row({ quiet: true })], names, NOW);
    expect(r.launchLabel).toBe("Found at launch, not emailed");
  });

  it("has no launch label for a normal row", () => {
    const [r] = shapeMemberAlerts([row()], names, NOW);
    expect(r.launchLabel).toBeNull();
  });

  it("shows the age of an open problem", () => {
    const [r] = shapeMemberAlerts([row()], names, NOW);
    expect(r.age).toBe("open 3 days");
  });

  it("excludes types the Guild does not see", () => {
    const rows = shapeMemberAlerts(
      [row({ type: "test_guild_hidden" }), row({ id: "n2" })],
      names,
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["n2"]);
  });

  it("fills the member, other member, event, type label and edit target", () => {
    const [r] = shapeMemberAlerts(
      [
        row({
          type: "closed_day_conflict",
          event_id: "e1",
          details: {
            role: "host",
            event_id: "e1",
            other_member_id: "m2",
            closed_date: "2026-11-26",
            closed_note: null,
          },
        }),
      ],
      names,
      NOW,
    );
    expect(r.memberName).toBe("Sample Brewing");
    expect(r.otherMemberName).toBe("Sample Taproom");
    expect(r.eventTitle).toBe("Trivia Night");
    expect(r.typeLabel).toBe("An event is on a closed day");
    expect(r.editMemberId).toBe("m1");
    expect(r.editPath).toBe(ALERT_EDIT_PATH);
    expect(ALERT_EDIT_PATH).toBe("/admin/notifications");
  });

  it("drops resolved rows older than 30 days and keeps recent ones, newest first", () => {
    const out = shapeMemberAlerts(
      [
        row({ id: "old", status: "resolved", resolved_at: ago(31) }),
        row({ id: "recent", status: "resolved", resolved_at: ago(2) }),
        row({ id: "open", created_at: ago(1) }),
      ],
      names,
      NOW,
    );
    expect(out.map((r) => r.id)).toEqual(["open", "recent"]);
    expect(out[1].age).toBe("resolved 2 days ago");
  });
});

describe("ageText", () => {
  it("handles today and one day", () => {
    expect(ageText(row({ created_at: ago(0) }), NOW)).toBe("open today");
    expect(ageText(row({ created_at: ago(1) }), NOW)).toBe("open 1 day");
  });
  it("words unread and read", () => {
    expect(ageText(row({ kind: "message", status: "unread", created_at: ago(2) }), NOW)).toBe(
      "unread 2 days",
    );
    expect(ageText(row({ kind: "message", status: "read", read_at: ago(0) }), NOW)).toBe(
      "read today",
    );
  });
});
