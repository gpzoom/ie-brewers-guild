import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/lib/supabase/types";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServiceRoleClient: async () => ({ rpc }) }));

const { notify } = await import("./notify.server");
const { registerNotificationType } = await import("./registry");
const { runNotificationSend } = await import("./send-run");
type ClaimedNotification = import("./send-run").ClaimedNotification;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "new-id", error: null });
});

registerNotificationType<{ who: string }>({
  type: "test_notify_msg",
  kind: "message",
  recipientRoles: ["owner", "co_owner"],
  guildSees: true,
  countsInGuildSummary: false,
  emailMode: "batched",
  reminderDaysBefore: null,
  portal: (d) => ({ title: "New inquiry", body: `${d.who} asked`, buttons: [] }),
  email: (d, ctx) => ({
    heading: "Someone asked about your opening",
    lines: [`${d.who} asked ${ctx.memberName} about a job.`],
    button: { label: "Open your jobs", path: "/portal/jobs" },
  }),
});

describe("notify", () => {
  it("inserts a message with the registry's kind, roles and email mode", async () => {
    await notify(
      "m1",
      "test_notify_msg",
      { who: "Pat" },
      { dedupeKey: "inq:1", eventId: "e1", dueDate: "2026-12-01" },
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("insert_member_message", {
      p_row: {
        type: "test_notify_msg",
        member_id: "m1",
        details: { who: "Pat" },
        dedupe_key: "inq:1",
        event_id: "e1",
        due_date: "2026-12-01",
        kind: "message",
        recipient_roles: ["owner", "co_owner"],
        email_mode: "batched",
        reminder_days: null,
      },
    });
  });

  it("leaves the optional fields null", async () => {
    await notify("m1", "test_notify_msg", { who: "Pat" });
    const row = rpc.mock.calls[0][1].p_row;
    expect(row.dedupe_key).toBeNull();
    expect(row.event_id).toBeNull();
    expect(row.due_date).toBeNull();
  });

  it("throws for a problem type, without touching the database", async () => {
    await expect(notify("m1", "closed_day_conflict", {})).rejects.toThrow(/problem/);
    await expect(notify("m1", "utc_calendar", {})).rejects.toThrow(/problem/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws for an unknown type", async () => {
    await expect(notify("m1", "nope", {})).rejects.toThrow(/Unknown notification type/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws when the insert fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("rls") });
    await expect(notify("m1", "test_notify_msg", { who: "Pat" })).rejects.toThrow("rls");
  });
});

describe("a new type works end to end with no change outside this test", () => {
  it("notify -> claim -> runNotificationSend -> one email", async () => {
    await notify("m1", "test_notify_msg", { who: "Pat" });
    const p = rpc.mock.calls[0][1].p_row;
    // What insert_member_message stores and the claim hands back.
    const claimed: ClaimedNotification = {
      id: "new-id",
      type: p.type,
      kind: "message",
      member_id: p.member_id,
      dedupe_key: p.dedupe_key,
      details: p.details,
      event_id: p.event_id,
      due_date: p.due_date,
      recipient_roles: p.recipient_roles,
      email_mode: p.email_mode,
      reminder_days: p.reminder_days,
      status: "unread",
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
    };
    const sent: Array<{ to: string[]; subject: string; html: string; text: string }> = [];
    const marked: unknown[] = [];
    await runNotificationSend({
      claim: async () => [claimed],
      loadMember: async () => ({
        name: "Mars Brewing Co.",
        timezone: "America/Los_Angeles",
        recipientsByRole: new Map<MemberRole, string[]>([
          ["owner", ["owner@mars.test"]],
          ["editor", ["editor@mars.test"]],
        ]),
      }),
      loadContext: async () => ({
        memberName: "Mars Brewing Co.",
        otherMemberName: null,
        eventTitle: null,
        timezone: "America/Los_Angeles",
      }),
      send: async (e) => {
        sent.push(e);
      },
      markSent: async (rows, err) => {
        marked.push([rows, err]);
      },
      markFailed: async () => {
        throw new Error("should not fail");
      },
      role: { origin: "https://live.test", staging: false },
      now: new Date("2026-11-13T18:15:00Z"),
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["owner@mars.test"]);
    expect(sent[0].subject).toBe("Someone asked about your opening");
    expect(sent[0].text).toContain("Pat asked Mars Brewing Co. about a job.");
    expect(sent[0].html).toContain('href="https://live.test/portal/jobs"');
    expect(marked).toEqual([[[{ id: "new-id", sendKind: "notice" }], null]]);
  });
});
