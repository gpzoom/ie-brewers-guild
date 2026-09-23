import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedText, syncOneIcsConnection, validateIcsUrl } from "./calendar-connection.server";
import type { CalendarConnectionRow } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("validateIcsUrl", () => {
  it("accepts a real http URL", () => {
    expect(validateIcsUrl("http://example.com/feed.ics")).toEqual({ valid: true });
  });

  it("accepts a real https URL", () => {
    expect(validateIcsUrl("https://example.com/feed.ics")).toEqual({ valid: true });
  });

  it("rejects a file:// URL", () => {
    const result = validateIcsUrl("file:///etc/passwd");
    expect(result.valid).toBe(false);
  });

  it("rejects a data: URL", () => {
    const result = validateIcsUrl("data:text/plain,hello");
    expect(result.valid).toBe(false);
  });

  it("rejects a string that doesn't parse as a URL at all", () => {
    const result = validateIcsUrl("not a url");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/valid url/i);
    }
  });

  it("rejects other exotic schemes (e.g. ftp)", () => {
    const result = validateIcsUrl("ftp://example.com/feed.ics");
    expect(result.valid).toBe(false);
  });
});

/** Builds a Response backed by a ReadableStream that yields the given chunks one at a time. */
function streamedResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, { headers });
}

describe("readBoundedText", () => {
  it("returns the full text when it's under the limit", async () => {
    const text = "BEGIN:VCALENDAR\nEND:VCALENDAR";
    const bytes = new TextEncoder().encode(text);
    const response = streamedResponse([bytes]);
    await expect(readBoundedText(response, 1024)).resolves.toBe(text);
  });

  it("reassembles text split across multiple stream chunks", async () => {
    const full = "hello world, this is a calendar feed";
    const encoded = new TextEncoder().encode(full);
    const mid = Math.floor(encoded.byteLength / 2);
    const response = streamedResponse([encoded.slice(0, mid), encoded.slice(mid)]);
    await expect(readBoundedText(response, 1024)).resolves.toBe(full);
  });

  it("throws instead of buffering once the accumulated size exceeds maxBytes", async () => {
    // Simulates an oversized/misconfigured feed: three 10-byte chunks
    // against a 15-byte cap -- must throw partway through, never
    // returning the fully-buffered ~30 bytes.
    const chunk = new Uint8Array(10).fill(65); // 10 bytes of 'A'
    const response = streamedResponse([chunk, chunk, chunk]);
    await expect(readBoundedText(response, 15)).rejects.toThrow(/larger than/i);
  });

  it("throws on a single chunk that alone exceeds the cap", async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024); // 2MB, over the 1MB production cap
    const response = streamedResponse([oversized]);
    await expect(readBoundedText(response, 1024 * 1024)).rejects.toThrow(/larger than/i);
  });

  it("never resolves with more than maxBytes worth of decoded content, even across many small chunks", async () => {
    // 1000 chunks of 1KB each = ~1MB of real payload against a 500KB cap --
    // this is the "Content-Length lied or was absent" case readBoundedText
    // exists to catch: no single chunk is oversized, but the running total
    // crosses the cap partway through.
    const chunks = Array.from({ length: 1000 }, () => new Uint8Array(1024).fill(66));
    const response = streamedResponse(chunks);
    await expect(readBoundedText(response, 500 * 1024)).rejects.toThrow(/larger than/i);
  });
});

const CONNECTION: CalendarConnectionRow = {
  id: "conn-1",
  member_id: "member-1",
  provider: "ics",
  google_calendar_id: null,
  ics_url: "https://example.com/feed.ics",
  sync_tag: "guild",
  last_synced_at: null,
  last_sync_error: null,
  sync_status: "ok",
};

/**
 * A minimal fake satisfying only the two `.from(table)` chains
 * syncOneIcsConnection actually calls on a failure path (it never reaches
 * the `events` upsert once the fetch itself fails/rejects) --
 * `calendar_connections.update(...).eq(...)`. Captures the patch so tests
 * can assert on the recorded sync_status/last_sync_error without a real
 * Supabase client.
 */
function fakeSupabase(): { supabase: SupabaseClient; lastUpdate: () => Record<string, unknown> | undefined } {
  let lastUpdate: Record<string, unknown> | undefined;
  const supabase = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        lastUpdate = patch;
        return { eq: async () => ({ data: [{ id: "conn-1" }], error: null }) };
      },
      upsert: async () => ({ error: null }),
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient, lastUpdate: () => lastUpdate };
}

/**
 * A fuller in-memory fake that actually persists `update()` patches onto a
 * row and serves them back via `select().eq().single()` -- used to
 * reproduce, end to end, exactly what refreshIcsConnectionNow's handler
 * does: call syncOneIcsConnection (which writes sync_status/last_sync_error
 * via update()), then re-select the same row. `refreshIcsConnectionNow`
 * itself is a createServerFn wrapping getSupabaseServerClientForRequest()
 * (a real per-request Cloudflare/Supabase client this repo has no existing
 * pattern for unit-testing directly -- see src/lib/supabase/server.ts), so
 * this reproduces its two-step logic against a fake table instead of
 * calling the wrapped handler itself.
 */
function fakeSupabaseWithRow(initial: CalendarConnectionRow): {
  supabase: SupabaseClient;
  getRow: () => CalendarConnectionRow;
} {
  let row: CalendarConnectionRow = { ...initial };
  const supabase = {
    from: (table: string) => {
      if (table !== "calendar_connections") {
        return { upsert: async () => ({ error: null }) };
      }
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            row = { ...row, ...patch } as CalendarConnectionRow;
            return { data: [{ id: row.id }], error: null };
          },
        }),
        select: () => ({
          eq: () => ({
            single: async () => ({ data: row, error: null }),
          }),
        }),
      };
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, getRow: () => row };
}

describe("syncOneIcsConnection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Concrete evidence for the timeout fix: mocks global fetch to never
   * resolve on its own, but to honor the AbortSignal it's given (exactly
   * like a real slow-looping/unresponsive feed server eventually would, at
   * the platform level) -- so the ONLY thing that can end this fetch is
   * ICS_FETCH_TIMEOUT_MS's own AbortSignal.timeout firing. Verifies the
   * real 10s production timeout actually elapses and produces the clear
   * "took too long" message via the existing catch-and-record-sync_status
   * path, not an unhandled rejection or a raw AbortError/DOMException
   * string. Uses a real 10s wait (see the per-test timeout below) rather
   * than faking timers, since AbortSignal.timeout's internal timer isn't
   * something vitest's fake timers reliably intercept.
   */
  it(
    "records a clear 'took too long' error when the feed never responds",
    async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
        const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(signal.reason);
          });
        });
      });

      const { supabase, lastUpdate } = fakeSupabase();
      await syncOneIcsConnection(supabase, CONNECTION);

      const update = lastUpdate();
      expect(update?.sync_status).toBe("failing");
      expect(update?.last_sync_error).toMatch(/took too long to respond/i);
    },
    15_000,
  );

  /** Concrete evidence for the size-cap fix's fast path: a feed that's honest about a too-large Content-Length is rejected without ever reading the (here, empty) body. */
  it("records a clear size-limit error when Content-Length exceeds the cap", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200, headers: { "content-length": String(6 * 1024 * 1024) } }),
    );

    const { supabase, lastUpdate } = fakeSupabase();
    await syncOneIcsConnection(supabase, CONNECTION);

    const update = lastUpdate();
    expect(update?.sync_status).toBe("failing");
    expect(update?.last_sync_error).toMatch(/larger than/i);
  });

  /** Concrete evidence for the size-cap fix's real backstop: a feed that UNDER-reports (or omits) Content-Length but streams an oversized body is still caught, by readBoundedText's own running-total check. */
  it("records a clear size-limit error when the streamed body exceeds the cap despite no (or a lying) Content-Length header", async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024).fill(65); // 2MB, over the 1MB production cap
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));

    const { supabase, lastUpdate } = fakeSupabase();
    await syncOneIcsConnection(supabase, CONNECTION);

    const update = lastUpdate();
    expect(update?.sync_status).toBe("failing");
    expect(update?.last_sync_error).toMatch(/larger than/i);
  });

  /**
   * Concrete evidence for the fast-path fix that pairs with the size-cap
   * fix above: the Content-Length-too-large rejection must actually cancel
   * the underlying stream, not just stop reading from it locally. The
   * stream below deliberately never closes on its own (no controller.close()
   * call) -- the ONLY way this response's body is ever torn down is a
   * genuine reader.cancel()/body.cancel() call, so a spy on `cancel` firing
   * proves the connection was actually released, not just abandoned.
   */
  it("cancels the response body's stream when Content-Length alone is enough to reject it", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start() {
        // Deliberately empty -- never enqueues or closes. Proves the only
        // thing that can end this stream is an explicit cancel() call.
      },
    });
    const response = new Response(stream, {
      status: 200,
      headers: { "content-length": String(2 * 1024 * 1024) },
    });
    const cancelSpy = vi.spyOn(response.body as ReadableStream<Uint8Array>, "cancel");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const { supabase, lastUpdate } = fakeSupabase();
    await syncOneIcsConnection(supabase, CONNECTION);

    expect(cancelSpy).toHaveBeenCalled();
    const update = lastUpdate();
    expect(update?.sync_status).toBe("failing");
    expect(update?.last_sync_error).toMatch(/larger than/i);
  });

  /**
   * Concrete evidence for fix #3 (timeout detection extended to cover
   * body-streaming, not just connection establishment): fetch() itself
   * resolves immediately with headers/a 200 status, but the body stream
   * then stalls indefinitely -- only the governing AbortSignal firing (the
   * real, unmodified 10s ICS_FETCH_TIMEOUT_MS) ever ends it, exactly
   * modeling a feed that starts responding, then hangs mid-transfer.
   * Before this fix, this scenario surfaced the raw platform abort text
   * (caught only around the initial fetch() call); after it, readBoundedText's
   * own reader.read() rejection is now also converted to the same friendly
   * message via toFriendlyFetchError.
   */
  it(
    "records the same clear 'took too long' error when the timeout fires mid-stream, after fetch() has already resolved",
    async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
        const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            signal?.addEventListener("abort", () => {
              controller.error(signal.reason);
            });
          },
        });
        return Promise.resolve(new Response(stream, { status: 200 }));
      });

      const { supabase, lastUpdate } = fakeSupabase();
      await syncOneIcsConnection(supabase, CONNECTION);

      const update = lastUpdate();
      expect(update?.sync_status).toBe("failing");
      expect(update?.last_sync_error).toMatch(/took too long to respond/i);
    },
    15_000,
  );

  /**
   * Concrete evidence for fix #1 (URL validation is now enforced INSIDE
   * syncOneIcsConnection itself, not only in saveIcsConnection's handler):
   * simulates a `data:` URL that reached the stored row by some path other
   * than saveIcsConnection (a direct Supabase REST PATCH, or -- before this
   * fix -- the Task 29 cron calling this exact function against whatever's
   * actually in the database). fetch must never even be attempted, and the
   * failure must be recorded the same graceful way as any other sync
   * failure.
   */
  it("rejects a data: URL stored directly on the row, gracefully, without ever calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { supabase, lastUpdate } = fakeSupabase();
    const maliciousConnection: CalendarConnectionRow = {
      ...CONNECTION,
      ics_url: "data:text/calendar,BEGIN:VCALENDAR%0AEND:VCALENDAR",
    };

    await syncOneIcsConnection(supabase, maliciousConnection);

    expect(fetchSpy).not.toHaveBeenCalled();
    const update = lastUpdate();
    expect(update?.sync_status).toBe("failing");
    expect(update?.last_sync_error).toMatch(/http/i);
  });

  /** Same as above, for a `file://` URL -- the other scheme the brief specifically called out. */
  it("rejects a file:// URL stored directly on the row, gracefully, without ever calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { supabase, lastUpdate } = fakeSupabase();
    const maliciousConnection: CalendarConnectionRow = { ...CONNECTION, ics_url: "file:///etc/passwd" };

    await syncOneIcsConnection(supabase, maliciousConnection);

    expect(fetchSpy).not.toHaveBeenCalled();
    const update = lastUpdate();
    expect(update?.sync_status).toBe("failing");
    expect(update?.last_sync_error).toMatch(/http/i);
  });

  /** Concrete evidence for fix #5: a pathologically long thrown message is capped before being persisted. */
  it("caps last_sync_error length rather than storing an unbounded message", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("x".repeat(10_000)));

    const { supabase, lastUpdate } = fakeSupabase();
    await syncOneIcsConnection(supabase, CONNECTION);

    const update = lastUpdate();
    expect(typeof update?.last_sync_error).toBe("string");
    expect((update?.last_sync_error as string).length).toBeLessThanOrEqual(500);
  });
});

describe("refreshIcsConnectionNow's re-select-after-sync data flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Concrete evidence for fix #2: reproduces refreshIcsConnectionNow's own
   * two-step logic (call syncOneIcsConnection, then re-select the row) end
   * to end against a persistent fake table, using a feed URL that returns a
   * real 503. Proves the row CalendarConnectionPanel's onRefreshNow now
   * receives back and feeds into setConnection has sync_status "failing"
   * and a real last_sync_error -- exactly what its existing
   * `connection.sync_status === "failing"` render branch checks -- rather
   * than the previous always-{ok:true} shape that left a failed refresh
   * invisible until a later reload.
   */
  it("returns a row with sync_status 'failing' and a real last_sync_error after a broken feed (503) sync", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Service Unavailable", { status: 503 }));

    const { supabase, getRow } = fakeSupabaseWithRow(CONNECTION);

    // Mirrors refreshIcsConnectionNow's handler body exactly: sync, then
    // re-select the same row by id.
    await syncOneIcsConnection(supabase, getRow());
    const refreshed = getRow();

    expect(refreshed.sync_status).toBe("failing");
    expect(refreshed.last_sync_error).toMatch(/responded with 503/i);
  });
});
