import { describe, expect, it } from "vitest";
import type { MemberNotificationRow } from "@/lib/supabase/types";
import {
  buildLaunchSummaryEmail,
  buildWeeklySummaryEmail,
  countWeek,
  isMondayPacific,
} from "./guild-summary";
import "./registry";

const NOW = new Date("2026-11-16T13:00:00Z");
const row = (o: Partial<MemberNotificationRow> = {}): MemberNotificationRow => ({
  id: "r1",
  type: "closed_day_conflict",
  kind: "problem",
  member_id: "mars",
  dedupe_key: "k1",
  details: {},
  event_id: "e1",
  due_date: "2026-11-26",
  recipient_roles: ["owner"],
  email_mode: "batched",
  reminder_days: 3,
  status: "open",
  quiet: false,
  created_at: "2026-11-14T18:00:00Z",
  resolved_at: null,
  read_at: null,
  notice_sent_at: null,
  reminder_sent_at: null,
  claimed_at: null,
  attempts: 0,
  last_error: null,
  ...o,
});

describe("countWeek", () => {
  it("counts a shared pair once", () => {
    const c = countWeek(
      [
        row({ id: "a", member_id: "mars", dedupe_key: "a" }),
        row({ id: "b", member_id: "tipzy", dedupe_key: "b" }),
      ],
      NOW,
    );
    expect(c).toEqual({ found: 1, resolved: 0, open: 1 });
  });
  it("counts a row resolved this week", () => {
    const c = countWeek(
      [
        row({
          status: "resolved",
          resolved_at: "2026-11-15T10:00:00Z",
          created_at: "2026-10-01T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(c).toEqual({ found: 0, resolved: 1, open: 0 });
  });
  it("ignores messages and old rows", () => {
    const c = countWeek(
      [
        row({ kind: "message", status: "unread" }),
        row({
          id: "o",
          dedupe_key: "o",
          event_id: "e9",
          created_at: "2026-10-01T00:00:00Z",
          status: "resolved",
          resolved_at: "2026-10-02T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(c).toEqual({ found: 0, resolved: 0, open: 0 });
  });
});

describe("weekly email", () => {
  it("is null for an empty week", () => {
    expect(
      buildWeeklySummaryEmail({ found: 0, resolved: 0, open: 0 }, "https://x.test", false),
    ).toBeNull();
  });
  it("has the counts and link", () => {
    const e = buildWeeklySummaryEmail({ found: 3, resolved: 1, open: 2 }, "https://x.test", false)!;
    expect(e.subject).toBe("Member alerts this week: 3 found, 1 resolved");
    expect(e.text).toContain("3 conflicts found, 1 resolved, 2 still open");
    expect(e.text).toContain("https://x.test/guild/alerts");
  });
});

describe("isMondayPacific", () => {
  it("true on Monday 13:00Z, false on Sunday", () => {
    expect(isMondayPacific(new Date("2026-11-16T13:00:00Z"))).toBe(true);
    expect(isMondayPacific(new Date("2026-11-15T13:00:00Z"))).toBe(false);
  });
});

describe("launch summary", () => {
  it("lists the quiet rows and says not emailed", () => {
    const e = buildLaunchSummaryEmail(
      [
        row({ id: "a", member_id: "mars", quiet: true, dedupe_key: "a", event_id: "e1" }),
        row({
          id: "b",
          member_id: "tipzy",
          quiet: true,
          type: "utc_calendar",
          dedupe_key: "utc:c1",
          event_id: null,
          due_date: null,
          details: { purpose: "food" },
        }),
        row({ id: "c", member_id: "other", quiet: false, dedupe_key: "c", event_id: "e3" }),
      ],
      {
        members: { mars: "Mars Brewing", tipzy: "Tipzy Taproom", other: "Other" },
        events: { e1: "Happy Hour" },
      },
      "https://x.test",
      false,
    );
    expect(e.text).toContain("Mars Brewing");
    expect(e.text).toContain("Happy Hour");
    expect(e.text).toContain("(hidden)");
    expect(e.text).toContain("Tipzy Taproom");
    expect(e.text).not.toContain("Other");
    expect(e.text).toContain("not emailed");
    expect(e.subject).toBe("Member alerts are live: 2 found at launch");
  });
});
