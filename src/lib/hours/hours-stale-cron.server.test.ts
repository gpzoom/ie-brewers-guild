import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberRow } from "@/lib/supabase/types";

// vi.mock factories are hoisted above imports -- fakes they close over must
// be created via vi.hoisted rather than plain top-level consts.
const { sendTransactionalEmail, signHoursConfirmToken, listMembers, updateCalls } = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
  signHoursConfirmToken: vi.fn(async (memberId: string) => `fake-token-${memberId}`),
  listMembers: vi.fn(),
  updateCalls: [] as Array<{ memberId: string; patch: Record<string, unknown> }>,
}));

vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail }));
vi.mock("@/lib/hours/confirm-token", () => ({ signHoursConfirmToken }));

// getSupabaseServiceRoleClient is a createServerOnlyFn backed by
// `cloudflare:workers`'s `env`, which doesn't resolve under vitest's Node
// test environment -- mocked out entirely. Models the two `.from("members")`
// call shapes sendHoursStaleNotices actually uses: the initial filtered
// select, and the later per-member update.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRoleClient: async () => ({
    from: (table: string) => {
      if (table !== "members") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              lt: async () => ({ data: listMembers(), error: null }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_column: string, memberId: string) => {
            updateCalls.push({ memberId, patch });
            return { data: [{ id: memberId }], error: null };
          },
        }),
      };
    },
  }),
}));

// cloudflare:workers only resolves inside the real Worker runtime --
// mocked here so `await import("cloudflare:workers")` inside
// sendHoursStaleNotices resolves to a fixed HOURS_CONFIRM_SECRET instead.
vi.mock("cloudflare:workers", () => ({
  env: { HOURS_CONFIRM_SECRET: "test-secret" },
}));

const { sendHoursStaleNotices } = await import("./hours-stale-cron.server");

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "member-1",
    slug: "member-1",
    member_type: "producer",
    business_name: "Test Brewery",
    tagline: null,
    city: "Riverside",
    state: "CA",
    street_address: null,
    postal_code: null,
    latitude: null,
    longitude: null,
    service_area: null,
    lead_time: null,
    phone: null,
    contact_email: null,
    timezone: "America/Los_Angeles",
    theme: "amber",
    logo_asset_id: null,
    cover_asset_id: null,
    cover_crop: null,
    member_since_year: null,
    discount_percent: null,
    discount_no_fixed_percent: false,
    discount_redeem_text: null,
    status: "published",
    hours_confirmed_at: "2026-01-01T00:00:00.000Z",
    hours_stale_notice_sent_at: null,
    published_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sendHoursStaleNotices", () => {
  afterEach(() => {
    sendTransactionalEmail.mockReset();
    signHoursConfirmToken.mockClear();
    listMembers.mockReset();
    updateCalls.length = 0;
  });

  /**
   * The review finding this test exists to cover: hours_stale_notice_sent_at
   * must NOT be written when sendTransactionalEmail throws (its current,
   * real, Task-19-stub behavior) -- otherwise "notified" would come to mean
   * "we tried," permanently suppressing this member's notice
   * (hasAlreadyBeenNotifiedForCurrentStalenessEpisode) even though no email
   * ever went out, with no self-healing once real sending is wired up later.
   */
  it("does NOT write hours_stale_notice_sent_at when sendTransactionalEmail throws", async () => {
    listMembers.mockReturnValue([makeMember({ id: "member-1" })]);
    sendTransactionalEmail.mockRejectedValue(new Error("not implemented yet"));

    await sendHoursStaleNotices();

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(updateCalls).toEqual([]);
  });

  /** The counterpart: a successful send still marks the member notified, exactly as before. */
  it("writes hours_stale_notice_sent_at when sendTransactionalEmail succeeds", async () => {
    listMembers.mockReturnValue([makeMember({ id: "member-2" })]);
    sendTransactionalEmail.mockResolvedValue(undefined);

    await sendHoursStaleNotices();

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].memberId).toBe("member-2");
    expect(typeof updateCalls[0].patch.hours_stale_notice_sent_at).toBe("string");
  });

  /** A mixed batch: one member's failed send must not block or corrupt another member's successful one. */
  it("processes members independently -- one failed send doesn't prevent another member's successful notice from being recorded", async () => {
    listMembers.mockReturnValue([makeMember({ id: "member-fail" }), makeMember({ id: "member-ok" })]);
    sendTransactionalEmail.mockImplementation(async (payload: { memberId: string }) => {
      if (payload.memberId === "member-fail") throw new Error("not implemented yet");
    });

    await sendHoursStaleNotices();

    expect(updateCalls.map((c) => c.memberId)).toEqual(["member-ok"]);
  });

  it("skips members already notified for the current staleness episode, without calling sendTransactionalEmail", async () => {
    listMembers.mockReturnValue([
      makeMember({
        id: "member-already-notified",
        hours_confirmed_at: "2026-01-01T00:00:00.000Z",
        hours_stale_notice_sent_at: "2026-01-02T00:00:00.000Z", // after confirmation
      }),
    ]);

    await sendHoursStaleNotices();

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(updateCalls).toEqual([]);
  });
});
