import { describe, expect, it } from "vitest";
import { registerNotificationType, rowFields, typeDef } from "./registry";
import type { NoticeContext, NotificationTypeDef } from "./types";

const ctx: NoticeContext = {
  memberName: "Tipzy Entertainment",
  otherMemberName: "Mars Brewing Co.",
  eventTitle: "Happy Hour $6 Pints",
  timezone: "America/Los_Angeles",
};

type ConflictDetails = {
  role: "own" | "host" | "guest";
  event_id: string;
  other_member_id: string | null;
  closed_date: string;
  closed_note: string | null;
};

const conflict = (role: ConflictDetails["role"], note: string | null = null): ConflictDetails => ({
  role,
  event_id: "e1",
  other_member_id: role === "own" ? null : "m2",
  closed_date: "2026-11-26",
  closed_note: note,
});

describe("notification registry", () => {
  it("has the reminder windows", () => {
    expect(typeDef("closed_day_conflict").reminderDaysBefore).toBe(3);
    expect(typeDef("utc_calendar").reminderDaysBefore).toBeNull();
  });

  it("throws on an unknown type", () => {
    expect(() => typeDef("nope")).toThrow();
  });

  it("returns a type registered later", () => {
    const def: NotificationTypeDef<unknown> = {
      type: "test_only",
      kind: "message",
      recipientRoles: ["owner"],
      guildSees: false,
      countsInGuildSummary: false,
      emailMode: "none",
      reminderDaysBefore: null,
      portal: () => ({ title: "t", body: "b", buttons: [] }),
      email: () => ({ heading: "h", lines: [], button: null }),
    };
    registerNotificationType(def);
    expect(typeDef("test_only")).toBe(def);
    expect(rowFields(def)).toEqual({
      kind: "message",
      recipient_roles: ["owner"],
      email_mode: "none",
      reminder_days: null,
    });
  });

  it("words an own conflict", () => {
    const p = typeDef("closed_day_conflict").portal(conflict("own", "Thanksgiving"), ctx);
    expect(p.title).toContain("closed day");
    expect(p.body).toBe(
      `Your event "Happy Hour $6 Pints" is on Thu, Nov 26, a day you've marked closed (Thanksgiving). It's hidden from your public page until this is fixed.`,
    );
    expect(p.buttons).toEqual([
      { label: "Edit in Events", to: "/portal/events" },
      { label: "Check Special hours", to: "/portal/basics" },
    ]);
  });

  it("omits the parentheses without a note", () => {
    const p = typeDef("closed_day_conflict").portal(conflict("own"), ctx);
    expect(p.body).not.toContain("(");
  });

  it("words a host conflict", () => {
    const p = typeDef("closed_day_conflict").portal(
      conflict("host", "Thanksgiving"),
      { ...ctx, eventTitle: "Mars Karaoke", otherMemberName: "Tipzy Entertainment" },
    );
    expect(p.body).toBe(
      `Tipzy Entertainment's "Mars Karaoke" is on Thu, Nov 26, a day you've marked closed (Thanksgiving). It's hidden from both your pages until this is fixed.`,
    );
  });

  it("words a guest conflict", () => {
    const p = typeDef("closed_day_conflict").portal(
      conflict("guest", "Thanksgiving"),
      { ...ctx, eventTitle: "Mars Karaoke" },
    );
    expect(p.body).toBe(
      `Your stop "Mars Karaoke" at Mars Brewing Co. is on Thu, Nov 26, a day they've marked closed (Thanksgiving). It's hidden until this is fixed. Contact Mars Brewing Co. or change your schedule.`,
    );
    expect(p.buttons.map((b) => b.label)).not.toContain("Check Special hours");
  });

  it("words the UTC calendar", () => {
    const d = { calendar_connection_id: "c1", purpose: "events" as const, feed_time_zone: "UTC" };
    const events = typeDef("utc_calendar").portal(d, ctx);
    expect(events.body).toBe(
      `Your Google Calendar (events calendar) is set to UTC, so your event times show 7–8 hours early. In Google Calendar, set the calendar's time zone to Pacific Time - Los Angeles, then check your event times.`,
    );
    const food = typeDef("utc_calendar").portal({ ...d, purpose: "food" }, ctx);
    expect(food.body).toContain("food calendar");
    expect(food.body).toContain("Pacific");
  });

  it("titles the email reminder", () => {
    const e = typeDef("closed_day_conflict").email(conflict("own"), ctx, "reminder");
    expect(e.heading).toContain("Reminder");
    const n = typeDef("closed_day_conflict").email(conflict("own"), ctx, "notice");
    expect(n.heading).not.toContain("Reminder");
  });
});
