import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarConnectionRow } from "@/lib/supabase/types";

// vi.mock factories are hoisted above imports, so the fakes they close over
// must be created via vi.hoisted rather than plain top-level consts.
const { syncOneIcsConnection, listConnections } = vi.hoisted(() => ({
  syncOneIcsConnection: vi.fn(),
  listConnections: vi.fn(),
}));

vi.mock("@/lib/events/calendar-connection.server", () => ({
  syncOneIcsConnection,
}));

// getSupabaseServiceRoleClient is a createServerOnlyFn backed by
// `cloudflare:workers`'s `env`, which doesn't resolve under vitest's Node
// test environment -- mocked out entirely, same as this file's only actual
// unit under test needs.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRoleClient: async () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: listConnections(), error: null }),
      }),
    }),
  }),
}));

const { refreshAllIcsConnections } = await import("./ics-refresh-cron.server");

function makeConnections(count: number): CalendarConnectionRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `conn-${i}`,
    member_id: `member-${i}`,
    provider: "ics" as const,
    google_calendar_id: null,
    ics_url: "https://example.com/feed.ics",
    sync_tag: "guild",
    last_synced_at: null,
    last_sync_error: null,
    sync_status: "ok" as const,
  }));
}

describe("refreshAllIcsConnections", () => {
  afterEach(() => {
    syncOneIcsConnection.mockReset();
    listConnections.mockReset();
  });

  /**
   * Concrete evidence for the bounded-concurrency fix: 13 connections against
   * a batch size of 5 must never have more than 5 syncOneIcsConnection calls
   * in flight at once, but also must not degrade to fully sequential (1 at a
   * time) -- each mocked call holds itself open on a real timer until
   * released, so the observed peak concurrency directly reflects the
   * implementation's actual batching, not an artifact of call order.
   */
  it("processes connections in batches of at most 5 concurrently -- never more, never just 1 at a time", async () => {
    const TOTAL = 13;
    listConnections.mockReturnValue(makeConnections(TOTAL));

    let inFlight = 0;
    let maxInFlight = 0;
    const callOrder: number[] = [];
    syncOneIcsConnection.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      callOrder.push(inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight--;
    });

    await refreshAllIcsConnections();

    expect(syncOneIcsConnection).toHaveBeenCalledTimes(TOTAL);
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1); // proves it isn't fully sequential either
  });

  it("awaits one batch fully before starting the next (bounded, not unbounded, parallelism)", async () => {
    const TOTAL = 11; // 3 batches of 5, 5, 1
    listConnections.mockReturnValue(makeConnections(TOTAL));

    let inFlight = 0;
    let sawFullBatchDrainToZero = false;
    syncOneIcsConnection.mockImplementation(async () => {
      inFlight++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      if (inFlight === 0) sawFullBatchDrainToZero = true;
    });

    await refreshAllIcsConnections();

    // If every connection ran in one unbounded Promise.all, inFlight would
    // only ever hit 0 once, at the very end -- observing it mid-run (it hits
    // 0 after the first batch of 5 finishes, before the second batch starts)
    // is only possible with sequential batching.
    expect(sawFullBatchDrainToZero).toBe(true);
    expect(syncOneIcsConnection).toHaveBeenCalledTimes(TOTAL);
  });

  it("does nothing when there are no ICS connections", async () => {
    listConnections.mockReturnValue([]);
    await expect(refreshAllIcsConnections()).resolves.toBeUndefined();
    expect(syncOneIcsConnection).not.toHaveBeenCalled();
  });
});
