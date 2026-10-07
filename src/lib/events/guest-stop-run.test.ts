import { describe, expect, it, vi } from "vitest";
import type { GuestStopNoticeRow } from "@/lib/supabase/types";
import { runGuestStopSend, type RunDeps } from "./guest-stop-run";

const NOW = new Date("2026-10-07T18:00:00Z");
const n = (o: Partial<GuestStopNoticeRow>): GuestStopNoticeRow => ({
  id: "n1", host_member_id: "mars", event_id: "e1", kind: "new", guest_name: "Tacos El Gordo", title: null,
  starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false, old_starts_at: null, old_ends_at: null,
  created_at: "2026-10-07T17:50:00Z", claimed_at: "2026-10-07T18:00:00Z", sent_at: null, attempts: 1, last_error: null, ...o,
});
const taproom = { slug: "mars", businessName: "Mars Brewing Co.", street: "9728 6th St", timezone: "America/Los_Angeles" };

function deps(o: Partial<RunDeps> = {}): RunDeps & { sent: string[][]; marked: Array<[string[], string | null]>; failed: Array<[string, string]> } {
  const sent: string[][] = [];
  const marked: Array<[string[], string | null]> = [];
  const failed: Array<[string, string]> = [];
  return {
    sent, marked, failed,
    claim: async () => [n({})],
    loadTaproom: async () => ({ taproom, recipients: ["owner@mars.test"], statusByEvent: new Map([["e1", "shown" as const]]) }),
    send: async (email) => {
      sent.push(email.to);
    },
    markSent: async (ids, lastError) => {
      marked.push([ids, lastError]);
    },
    markFailed: async (id, message) => {
      failed.push([id, message]);
    },
    role: { origin: "https://x", staging: false },
    secret: "k",
    now: NOW,
    ...o,
  };
}

describe("runGuestStopSend", () => {
  it("one email per taproom, then marked sent", async () => {
    const d = deps();
    await runGuestStopSend(d);
    expect(d.sent).toEqual([["owner@mars.test"]]);
    expect(d.marked).toEqual([[["n1"], null]]);
  });
  it("a taproom lookup that fails is retried later, never marked sent (the email isn't lost)", async () => {
    const d = deps({ loadTaproom: async () => { throw new Error("db down"); } });
    await runGuestStopSend(d);
    expect(d.sent).toEqual([]);
    expect(d.marked).toEqual([]);
    expect(d.failed).toEqual([["n1", "db down"]]);
  });
  it("no owner or editor email: marked sent with 'no recipient'", async () => {
    const d = deps({ loadTaproom: async () => ({ taproom, recipients: [], statusByEvent: new Map() }) });
    await runGuestStopSend(d);
    expect(d.sent).toEqual([]);
    expect(d.marked).toEqual([[["n1"], "no recipient"]]);
  });
  it("a visit that's already over isn't emailed (a backlog never sends stale mail)", async () => {
    const d = deps({ claim: async () => [n({ id: "old", starts_at: "2026-10-05T00:00:00Z", ends_at: "2026-10-05T03:00:00Z" }), n({})] });
    await runGuestStopSend(d);
    expect(d.marked).toContainEqual([["old"], "over"]);
    expect(d.sent).toHaveLength(1);
  });
  it("the email went but marking it sent failed: no throw, and nothing else is retried here", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ markSent: async () => { throw new Error("db down"); } });
    await expect(runGuestStopSend(d)).resolves.toBeUndefined();
    expect(d.sent).toHaveLength(1);
    expect(d.failed).toEqual([]);
    log.mockRestore();
  });
  it("staging sends to the test inbox only", async () => {
    const d = deps({ role: { origin: "https://staging", staging: true } });
    await runGuestStopSend(d);
    expect(d.sent).toEqual([["boblelle77+iscadmin@gmail.com"]]);
  });
});
