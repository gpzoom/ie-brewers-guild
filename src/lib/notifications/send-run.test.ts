import { describe, expect, it, vi } from "vitest";
import type { MemberNotificationRow, MemberRole } from "@/lib/supabase/types";
import { STAGING_GUILD_NOTIFICATION_EMAIL } from "@/lib/email/build-email-content";
import { registerNotificationType } from "./registry";
import { runNotificationSend, type ClaimedNotification, type SendDeps } from "./send-run";

const c = (o: Partial<ClaimedNotification> = {}): ClaimedNotification => ({
  id: "r1",
  type: "utc_calendar",
  kind: "problem",
  member_id: "mars",
  dedupe_key: "utc:c1",
  details: { calendar_connection_id: "c1", purpose: "events", feed_time_zone: "UTC" },
  event_id: null,
  due_date: null,
  recipient_roles: ["owner", "co_owner", "editor", "media_events"],
  email_mode: "batched",
  reminder_days: null,
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
  send_kind: "notice",
  ...o,
});

const people = (m: string): Map<MemberRole, string[]> =>
  new Map<MemberRole, string[]>([
    ["owner", [`owner@${m}.test`]],
    ["editor", [`editor@${m}.test`, `owner@${m}.test`]],
    ["media_events", [`media@${m}.test`]],
  ]);

type Spy = {
  sent: Array<{ to: string[]; subject: string; html: string; text: string }>;
  marked: Array<[Array<{ id: string; sendKind: string }>, string | null]>;
  failed: Array<[string, string]>;
};

function deps(o: Partial<SendDeps> = {}): SendDeps & Spy {
  const spy: Spy = { sent: [], marked: [], failed: [] };
  return {
    ...spy,
    claim: async () => [c()],
    loadMember: async (id) => ({
      name: `${id} co`,
      timezone: "America/Los_Angeles",
      recipientsByRole: people(id),
    }),
    loadContext: async (row) => ({
      memberName: `${row.member_id} co`,
      otherMemberName: null,
      eventTitle: null,
      timezone: "America/Los_Angeles",
    }),
    send: async (email) => {
      spy.sent.push(email);
    },
    markSent: async (rows, lastError) => {
      spy.marked.push([rows, lastError]);
    },
    markFailed: async (id, msg) => {
      spy.failed.push([id, msg]);
    },
    role: { origin: "https://live.test", staging: false },
    now: new Date("2026-11-13T18:15:00Z"),
    ...o,
  };
}

describe("runNotificationSend", () => {
  it("does nothing when nothing is claimed", async () => {
    const d = deps({ claim: async () => [] });
    await runNotificationSend(d);
    expect(d.sent).toEqual([]);
    expect(d.marked).toEqual([]);
  });

  it("two rows for one member: one email, both marked sent", async () => {
    const d = deps({
      claim: async () => [
        c({ id: "a" }),
        c({
          id: "b",
          details: { calendar_connection_id: "c2", purpose: "food", feed_time_zone: "UTC" },
        }),
      ],
    });
    await runNotificationSend(d);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].subject).toBe("mars co: 2 alerts");
    expect(d.marked).toEqual([
      [
        [
          { id: "a", sendKind: "notice" },
          { id: "b", sendKind: "notice" },
        ],
        null,
      ],
    ]);
  });

  it("three members: three emails, each to its own people", async () => {
    const d = deps({
      claim: async () => [
        c({ id: "a", member_id: "m1" }),
        c({ id: "b", member_id: "m2" }),
        c({ id: "c", member_id: "m3" }),
      ],
    });
    await runNotificationSend(d);
    expect(d.sent).toHaveLength(3);
    expect(d.sent.map((e) => e.to[0])).toEqual(["owner@m1.test", "owner@m2.test", "owner@m3.test"]);
  });

  it("recipients are the union of the rows' roles, deduped", async () => {
    const d = deps({
      claim: async () => [
        c({ id: "a", recipient_roles: ["owner"] }),
        c({ id: "b", recipient_roles: ["editor"] }),
      ],
    });
    await runNotificationSend(d);
    expect(d.sent[0].to).toEqual(["owner@mars.test", "editor@mars.test"]);
  });

  it("all four roles reach owner, editors and Photos & events editors", async () => {
    const d = deps();
    await runNotificationSend(d);
    expect(d.sent[0].to.sort()).toEqual(["editor@mars.test", "media@mars.test", "owner@mars.test"]);
  });

  it("staging sends only to the test inbox, with a [Staging] subject", async () => {
    const d = deps({ role: { origin: "https://staging.test", staging: true } });
    await runNotificationSend(d);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].to).toEqual([STAGING_GUILD_NOTIFICATION_EMAIL]);
    expect(d.sent[0].subject.startsWith("[Staging] ")).toBe(true);
    expect(d.sent[0].html).toContain("https://staging.test/portal/events");
  });

  it("no recipient: nothing sent, marked 'no recipient'", async () => {
    const d = deps({
      loadMember: async () => ({
        name: "mars co",
        timezone: "America/Los_Angeles",
        recipientsByRole: new Map(),
      }),
    });
    await runNotificationSend(d);
    expect(d.sent).toEqual([]);
    expect(d.marked).toEqual([[[{ id: "r1", sendKind: "notice" }], "no recipient"]]);
  });

  it("staging sends to the test inbox even when the member has no addresses", async () => {
    const d = deps({
      role: { origin: "https://staging.test", staging: true },
      loadMember: async () => ({
        name: "Sample Brewery",
        timezone: "America/Los_Angeles",
        recipientsByRole: new Map(),
      }),
    });
    await runNotificationSend(d);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].to).toEqual([STAGING_GUILD_NOTIFICATION_EMAIL]);
    expect(d.marked).toEqual([[[{ id: "r1", sendKind: "notice" }], null]]);
  });

  it("staging: a member that no longer exists still counts as no recipient", async () => {
    const d = deps({
      role: { origin: "https://staging.test", staging: true },
      loadMember: async () => null,
    });
    await runNotificationSend(d);
    expect(d.sent).toEqual([]);
    expect(d.marked).toEqual([[[{ id: "r1", sendKind: "notice" }], "no recipient"]]);
  });

  it("a member that no longer exists counts as no recipient", async () => {
    const d = deps({ loadMember: async () => null });
    await runNotificationSend(d);
    expect(d.sent).toEqual([]);
    expect(d.marked).toEqual([[[{ id: "r1", sendKind: "notice" }], "no recipient"]]);
  });

  it("a send error marks that member's rows failed and the other members still send", async () => {
    const d = deps({
      claim: async () => [
        c({ id: "a", member_id: "m1" }),
        c({ id: "b", member_id: "m1" }),
        c({ id: "c", member_id: "m2" }),
      ],
    });
    const send = d.send;
    d.send = async (email) => {
      if (email.to.includes("owner@m1.test")) throw new Error("Resend 500");
      await send(email);
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runNotificationSend(d);
    expect(d.failed).toEqual([
      ["a", "Resend 500"],
      ["b", "Resend 500"],
    ]);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].to[0]).toBe("owner@m2.test");
    expect(d.marked).toEqual([[[{ id: "c", sendKind: "notice" }], null]]);
    vi.restoreAllMocks();
  });

  it("a lookup error marks the rows failed, not sent", async () => {
    const d = deps({
      loadMember: async () => {
        throw new Error("db down");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runNotificationSend(d);
    expect(d.failed).toEqual([["r1", "db down"]]);
    expect(d.marked).toEqual([]);
    vi.restoreAllMocks();
  });

  it("an unknown type fails only its own row", async () => {
    const d = deps({ claim: async () => [c({ id: "x", type: "no_such_type" }), c({ id: "a" })] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runNotificationSend(d);
    expect(d.failed).toEqual([["x", "Unknown notification type: no_such_type"]]);
    expect(d.sent).toHaveLength(1);
    expect(d.marked).toEqual([[[{ id: "a", sendKind: "notice" }], null]]);
    vi.restoreAllMocks();
  });

  it("a reminder: the email says Reminder and marks reminder_sent_at", async () => {
    const d = deps({
      claim: async () => [
        c({
          id: "r9",
          type: "closed_day_conflict",
          dedupe_key: "cd:1",
          details: {
            role: "own",
            event_id: "e1",
            other_member_id: null,
            closed_date: "2026-11-26",
            closed_note: null,
          },
          event_id: "e1",
          due_date: "2026-11-26",
          reminder_days: 3,
          notice_sent_at: "2026-11-13T18:15:00Z",
          send_kind: "reminder",
        }),
      ],
    });
    await runNotificationSend(d);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].subject).toContain("Reminder");
    expect(d.sent[0].text).toContain("Reminder");
    expect(d.marked).toEqual([[[{ id: "r9", sendKind: "reminder" }], null]]);
  });

  it("calls each type's afterSend once per sent row, after it is marked", async () => {
    const order: string[] = [];
    const afterSend = vi.fn(async (row: MemberNotificationRow) => {
      order.push(`after:${row.id}`);
    });
    registerNotificationType({
      type: "test_after_send_msg",
      kind: "message",
      recipientRoles: ["owner"],
      guildSees: true,
      countsInGuildSummary: false,
      emailMode: "batched",
      reminderDaysBefore: null,
      portal: () => ({ title: "t", body: "b", buttons: [] }),
      email: () => ({ heading: "Hello", lines: ["Body"], button: null }),
      afterSend,
    });
    const d = deps({
      claim: async () => [
        c({ id: "a", type: "test_after_send_msg", kind: "message", status: "unread" }),
        c({ id: "b", type: "test_after_send_msg", kind: "message", status: "unread" }),
        c({ id: "u" }),
      ],
    });
    const mark = d.markSent;
    d.markSent = async (rows, err) => {
      order.push("marked");
      await mark(rows, err);
    };
    await runNotificationSend(d);
    expect(afterSend).toHaveBeenCalledTimes(2);
    expect(afterSend.mock.calls.map(([r]) => r.id)).toEqual(["a", "b"]);
    expect(order).toEqual(["marked", "after:a", "after:b"]);
  });

  it("afterSend is not called when nothing was sent, and its error doesn't stop the run", async () => {
    const afterSend = vi.fn(async () => {
      throw new Error("hook broke");
    });
    registerNotificationType({
      type: "test_after_send_throws",
      kind: "message",
      recipientRoles: ["owner"],
      guildSees: true,
      countsInGuildSummary: false,
      emailMode: "batched",
      reminderDaysBefore: null,
      portal: () => ({ title: "t", body: "b", buttons: [] }),
      email: () => ({ heading: "Hello", lines: ["Body"], button: null }),
      afterSend,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const none = deps({
      claim: async () => [
        c({ id: "a", type: "test_after_send_throws", kind: "message", status: "unread" }),
      ],
      loadMember: async () => null,
    });
    await runNotificationSend(none);
    expect(afterSend).not.toHaveBeenCalled();

    const d = deps({
      claim: async () => [
        c({
          id: "a",
          member_id: "m1",
          type: "test_after_send_throws",
          kind: "message",
          status: "unread",
        }),
        c({ id: "b", member_id: "m2" }),
      ],
    });
    await runNotificationSend(d);
    expect(afterSend).toHaveBeenCalledTimes(1);
    expect(d.sent).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it("a failed mark after the email went is logged, not retried or marked failed", async () => {
    const d = deps({
      markSent: async () => {
        throw new Error("update failed");
      },
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runNotificationSend(d);
    expect(d.sent).toHaveLength(1);
    expect(d.failed).toEqual([]);
    expect(err).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  describe("a notice already inside the reminder window counts as the reminder", () => {
    const conflict = (o: Partial<ClaimedNotification>) =>
      c({
        type: "closed_day_conflict",
        dedupe_key: "cd:1",
        details: {
          role: "own",
          event_id: "e1",
          other_member_id: null,
          closed_date: "2026-11-15",
          closed_note: null,
        },
        event_id: "e1",
        reminder_days: 3,
        ...o,
      });

    it("(a) a conflict 2 days out: marks the notice and the reminder", async () => {
      const d = deps({ claim: async () => [conflict({ id: "a", due_date: "2026-11-15" })] });
      await runNotificationSend(d);
      expect(d.sent).toHaveLength(1);
      expect(d.marked).toEqual([[[{ id: "a", sendKind: "notice", alsoReminder: true }], null]]);
    });

    it("(b) a conflict 10 days out: marks only the notice", async () => {
      const d = deps({ claim: async () => [conflict({ id: "b", due_date: "2026-11-23" })] });
      await runNotificationSend(d);
      expect(d.marked).toEqual([[[{ id: "b", sendKind: "notice" }], null]]);
      expect(d.marked[0][0][0]).not.toHaveProperty("alsoReminder");
    });

    it("(c) reminder_days null (UTC calendar) never marks a reminder", async () => {
      const d = deps({
        claim: async () => [c({ id: "u", due_date: "2026-11-14", reminder_days: null })],
      });
      await runNotificationSend(d);
      expect(d.marked[0][0][0]).not.toHaveProperty("alsoReminder");
    });

    it("the window starts exactly due_date - reminder_days", async () => {
      const d = deps({ claim: async () => [conflict({ id: "e", due_date: "2026-11-16" })] });
      await runNotificationSend(d);
      expect(d.marked).toEqual([[[{ id: "e", sendKind: "notice", alsoReminder: true }], null]]);
      const later = deps({ claim: async () => [conflict({ id: "f", due_date: "2026-11-17" })] });
      await runNotificationSend(later);
      expect(later.marked).toEqual([[[{ id: "f", sendKind: "notice" }], null]]);
    });

    it("uses the member's time zone for today", async () => {
      // 05:00 UTC Nov 14 is still Nov 13 in Los Angeles; window opens Nov 14.
      const now = new Date("2026-11-14T05:00:00Z");
      const la = deps({ now, claim: async () => [conflict({ id: "g", due_date: "2026-11-17" })] });
      await runNotificationSend(la);
      expect(la.marked).toEqual([[[{ id: "g", sendKind: "notice" }], null]]);
      const utcMember = deps({
        now,
        claim: async () => [conflict({ id: "h", due_date: "2026-11-17" })],
        loadMember: async (id) => ({
          name: `${id} co`,
          timezone: "UTC",
          recipientsByRole: people(id),
        }),
      });
      await runNotificationSend(utcMember);
      expect(utcMember.marked).toEqual([
        [[{ id: "h", sendKind: "notice", alsoReminder: true }], null],
      ]);
    });

    it("a reminder or a message is never flagged", async () => {
      const d = deps({
        claim: async () => [
          conflict({
            id: "r",
            due_date: "2026-11-15",
            notice_sent_at: "2026-11-01T00:00:00Z",
            send_kind: "reminder",
          }),
        ],
      });
      await runNotificationSend(d);
      expect(d.marked).toEqual([[[{ id: "r", sendKind: "reminder" }], null]]);
    });
  });
});
