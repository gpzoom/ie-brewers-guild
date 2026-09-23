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
    const oversized = new Uint8Array(6 * 1024 * 1024); // 6MB, over the 5MB production cap
    const response = streamedResponse([oversized]);
    await expect(readBoundedText(response, 5 * 1024 * 1024)).rejects.toThrow(/larger than/i);
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
    const oversized = new Uint8Array(6 * 1024 * 1024).fill(65);
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
});
