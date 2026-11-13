import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE_URL } from "@/lib/email/build-email-content";
import { fakeSupabase } from "@/lib/events/fake-supabase.test-helper";

// vi.mock factories are hoisted above imports: their fakes come from vi.hoisted.
const h = vi.hoisted(() => ({
  env: { SITE_ORIGIN: undefined as string | undefined },
  tables: {} as Record<string, unknown[]>,
  rpc: vi.fn(async () => ({ error: null })),
}));

vi.mock("cloudflare:workers", () => ({ env: h.env }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRoleClient: async () => {
    const { client } = fakeSupabase(h.tables);
    return Object.assign(client as object, { rpc: h.rpc });
  },
}));

const { refreshMemberProblems } = await import("./problems.server");

const event = {
  member_id: "mars",
  title: "Trivia",
  venue_name: null,
  address: null,
  city: null,
  starts_at: "2026-11-27T02:00:00Z",
  ends_at: null,
  all_day: false,
  overlay_status: null,
  overlay_starts_at: null,
  is_hidden: false,
  event_hosts: null,
};

// An open closed-day row with no matching conflict: a full check resolves it.
const staleOpen = {
  id: "n1",
  type: "closed_day_conflict",
  kind: "problem",
  member_id: "mars",
  dedupe_key: "closed_day_conflict:mars:gone:2026-11-26",
  details: { role: "own", event_id: "gone", other_member_id: null },
  event_id: "gone",
  due_date: "2026-11-26",
  recipient_roles: ["owner"],
  email_mode: "batched",
  reminder_days: 3,
  status: "open",
  quiet: false,
  created_at: "2026-11-10T00:00:00Z",
  resolved_at: null,
  read_at: null,
  notice_sent_at: null,
  reminder_sent_at: null,
  claimed_at: null,
  attempts: 0,
  last_error: null,
};

function load(eventCount: number) {
  h.tables = {
    members: [
      {
        id: "mars",
        business_name: "Mars Brewing",
        member_type: "producer",
        timezone: "America/Los_Angeles",
        status: "published",
      },
    ],
    special_hours: [],
    events: Array.from({ length: eventCount }, (_, n) => ({ ...event, id: `e${n}` })),
    calendar_connections: [],
    member_notifications: [staleOpen],
  };
}

describe("refreshMemberProblems at the events row cap", () => {
  afterEach(() => {
    h.rpc.mockClear();
    vi.restoreAllMocks();
  });

  it("999 events: proceeds and applies", async () => {
    h.env.SITE_ORIGIN = SITE_URL;
    load(999);
    expect(await refreshMemberProblems()).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith("apply_member_problems", {
      p_opens: [],
      p_resolve_ids: ["n1"],
    });
  });

  it("1000 events: fails closed -- logs, applies nothing, returns false", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.env.SITE_ORIGIN = SITE_URL;
    load(1000);
    expect(await refreshMemberProblems()).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("refreshMemberProblems failed", expect.any(Error));
  });
});
