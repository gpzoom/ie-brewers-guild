import { describe, expect, it } from "vitest";
import type { MemberNotificationRow } from "@/lib/supabase/types";
import { buildNotificationEmail } from "./email";
import type { NoticeContext } from "./types";
import "./registry";

const row = (o: Partial<MemberNotificationRow> = {}): MemberNotificationRow => ({
  id: "r1",
  type: "closed_day_conflict",
  kind: "problem",
  member_id: "mars",
  dedupe_key: "k1",
  details: {
    role: "own",
    event_id: "e1",
    other_member_id: null,
    closed_date: "2026-11-26",
    closed_note: "Thanksgiving",
  },
  event_id: "e1",
  due_date: "2026-11-26",
  recipient_roles: ["owner", "co_owner", "editor", "media_events"],
  email_mode: "batched",
  reminder_days: 3,
  status: "open",
  quiet: false,
  created_at: "2026-11-13T18:00:00Z",
  resolved_at: null,
  read_at: null,
  notice_sent_at: null,
  reminder_sent_at: null,
  claimed_at: "2026-11-13T18:15:00Z",
  attempts: 1,
  last_error: null,
  ...o,
});
const ctx: NoticeContext = {
  memberName: "Mars Brewing Co.",
  otherMemberName: null,
  eventTitle: "Happy Hour",
  timezone: "America/Los_Angeles",
};
const utc = row({
  id: "r2",
  type: "utc_calendar",
  details: { calendar_connection_id: "c1", purpose: "food", feed_time_zone: "UTC" },
  event_id: null,
  due_date: null,
  reminder_days: null,
});

describe("buildNotificationEmail", () => {
  it("one item: the subject is its heading; the button links origin + path", () => {
    const e = buildNotificationEmail({
      memberName: "Mars Brewing Co.",
      items: [{ row: row(), sendKind: "notice", ctx }],
      origin: "https://iscbrewersguild.org",
      staging: false,
    });
    expect(e.subject).toBe("An event is on a closed day");
    expect(e.html).toContain('href="https://iscbrewersguild.org/portal/events"');
    expect(e.html).toContain("background: #BE5A0A");
    expect(e.html).toContain("color: #241F1A");
    expect(e.text).toContain("Edit in Events: https://iscbrewersguild.org/portal/events");
    expect(e.text).toContain('"Happy Hour"');
    expect(e.text).toContain("Thu, Nov 26");
  });

  it("several items: one email listing all of them, subject names the member and the count", () => {
    const e = buildNotificationEmail({
      memberName: "Mars Brewing Co.",
      items: [
        { row: row(), sendKind: "notice", ctx },
        { row: utc, sendKind: "notice", ctx },
      ],
      origin: "https://x.test",
      staging: false,
    });
    expect(e.subject).toBe("Mars Brewing Co.: 2 alerts");
    expect(e.text).toContain("An event is on a closed day");
    expect(e.text).toContain("Your calendar is set to UTC");
    expect(e.text).toContain("food calendar");
  });

  it("a reminder is labeled Reminder", () => {
    const e = buildNotificationEmail({
      memberName: "Mars Brewing Co.",
      items: [{ row: row(), sendKind: "reminder", ctx }],
      origin: "https://x.test",
      staging: false,
    });
    expect(e.subject).toBe("Reminder: an event is on a closed day");
    expect(e.html).toContain("Reminder");
  });

  it("staging prefixes the subject", () => {
    const e = buildNotificationEmail({
      memberName: "Sample Brewery",
      items: [{ row: row(), sendKind: "notice", ctx: { ...ctx, memberName: "Sample Brewery" } }],
      origin: "https://staging.test",
      staging: true,
    });
    expect(e.subject).toBe("[Staging] An event is on a closed day");
  });

  it("escapes member-supplied text in the HTML", () => {
    const e = buildNotificationEmail({
      memberName: "A & B <Brewing>",
      items: [
        { row: row(), sendKind: "notice", ctx: { ...ctx, eventTitle: "<script>x</script>" } },
      ],
      origin: "https://x.test",
      staging: false,
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("A &amp; B &lt;Brewing&gt;");
  });
});
