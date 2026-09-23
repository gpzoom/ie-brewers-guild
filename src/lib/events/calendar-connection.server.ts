import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { buildEventUpsertRows, parseIcsFeedForTag } from "@/lib/events/ics-sync";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { CalendarConnectionRow } from "@/lib/supabase/types";

/**
 * This is the first place in this repo where the server fetches an
 * arbitrary, member-supplied URL rather than only ever talking to Supabase
 * or a fixed set of known services (`connection.ics_url`, below) -- so it
 * carries real caps a normal internal fetch doesn't need. Same cap
 * precedent as `src/lib/media/validate-file.ts`'s `MAX_UPLOAD_BYTES` for
 * uploaded files (25MB there, since a real photo/logo legitimately needs
 * that much), but set much smaller here -- 1MB, not the 5MB first shipped
 * with this feature -- because a plain-text ICS calendar feed has no
 * legitimate reason to approach even that, AND because the ICS-parsing
 * step that runs after the fetch/read completes (parseIcsFeedForTag,
 * below) is itself unbounded CPU work with no timeout of its own covering
 * it (ICS_FETCH_TIMEOUT_MS only bounds the network fetch/read) -- a
 * smaller cap on the input text directly shrinks that uncovered exposure
 * too.
 */
const MAX_ICS_BYTES = 1 * 1024 * 1024;

/** An unresponsive or deliberately slow-looping feed URL must fail with a
 * clear, diagnosable error rather than hang until Cloudflare Workers' own
 * platform-level request time limit kills it. */
const ICS_FETCH_TIMEOUT_MS = 10_000;

export type IcsUrlValidation = { valid: true } | { valid: false; reason: string };

/**
 * Rejects anything that isn't a genuine http(s) URL before it's ever stored
 * or fetched -- a member could otherwise put `file://`, `data:`, or some
 * other scheme in this field, and syncOneIcsConnection would later hand it
 * straight to `fetch`. Extracted as its own pure, exported function so it's
 * unit-testable without a Supabase client.
 */
export function validateIcsUrl(icsUrl: string): IcsUrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(icsUrl);
  } catch {
    return { valid: false, reason: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: "The calendar URL must start with http:// or https://." };
  }
  return { valid: true };
}

/**
 * Reads a fetch `Response` body up to `maxBytes`, throwing instead of
 * buffering further, rather than trusting `response.text()` to bound
 * itself -- `response.text()` has no size limit at all, so a malicious or
 * misconfigured feed URL that returns (or never stops streaming) an
 * enormous body would otherwise exhaust the Worker's memory/CPU. This is
 * the real backstop: the `Content-Length` header check in
 * syncOneIcsConnection below is only a fast-path early-exit, since
 * `Content-Length` isn't always sent and can't be fully trusted (a server
 * can lie, or stream indefinitely with no length header at all).
 *
 * Cancels the underlying stream (`reader.cancel()`) the moment the cap is
 * exceeded, so the connection is actually torn down rather than continuing
 * to receive bytes in the background after this function has already
 * decided to fail.
 */
export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    // No streaming body available in this runtime (not expected in
    // Cloudflare Workers, but harmless to fall back) -- the
    // Content-Length check in the caller already ran before this, so this
    // isn't the only guard in practice.
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(
        `The calendar feed is larger than the ${Math.round(maxBytes / (1024 * 1024))}MB limit.`,
      );
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(combined);
}

/**
 * Converts a fetch/stream-read abort into the clear, diagnosable message
 * syncOneIcsConnection wants to record, instead of the platform's raw
 * "The operation was aborted due to timeout" text. `AbortSignal.timeout`'s
 * abort reason is a DOMException named "TimeoutError" (a plain
 * "AbortError" for any other abort path) -- and since the SAME signal
 * passed to `fetch()` also governs the response body stream (aborting it
 * errors any in-flight `reader.read()` the same way), this must be applied
 * around BOTH the initial `fetch()` call and the later `readBoundedText`
 * read loop, not just the former -- a timeout that fires mid-stream (after
 * headers arrive but before the body finishes) would otherwise surface
 * this same raw platform text instead of the friendly one. Any other
 * error is passed through unchanged.
 */
function toFriendlyFetchError(err: unknown): Error {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new Error("The calendar feed took too long to respond.");
  }
  return err instanceof Error ? err : new Error(String(err));
}

export const getCalendarConnection = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: connection } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("member_id", data.memberId)
      .eq("provider", "ics")
      .maybeSingle();
    return (connection as CalendarConnectionRow | null) ?? null;
  });

export const saveIcsConnection = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; icsUrl: string; syncTag: string }) => data)
  .handler(async ({ data }) => {
    // Must happen before anything is stored -- see validateIcsUrl's own
    // doc comment above for why this is the first real gap in this file.
    const urlCheck = validateIcsUrl(data.icsUrl);
    if (!urlCheck.valid) throw new Error(urlCheck.reason);

    const supabase = await getSupabaseServerClientForRequest();
    const { data: existing } = await supabase
      .from("calendar_connections")
      .select("id")
      .eq("member_id", data.memberId)
      .eq("provider", "ics")
      .maybeSingle();

    if (existing) {
      // .select("id") + row-count check -- same gotcha cover.server.ts's
      // updateCoverAsset/updateCoverCrop and events.server.ts's updateEvent
      // guard against: PostgREST reports an RLS-denied UPDATE as success
      // (`error: null`) with zero rows affected, not as an `error`.
      // Without this, a write blocked by RLS would silently report
      // success back to CalendarConnectionPanel's UI. The INSERT branch
      // below doesn't need this -- an INSERT's RLS `with check` failure
      // raises a real error, unlike UPDATE's silent-zero-rows behavior.
      const { data: updated, error } = await supabase
        .from("calendar_connections")
        .update({ ics_url: data.icsUrl, sync_tag: data.syncTag, sync_status: "ok", last_sync_error: null })
        .eq("id", existing.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!updated || updated.length === 0) {
        throw new Error("Save failed — you may not have permission to edit this connection.");
      }

      await recordAuditLogIfImpersonating({
        memberId: data.memberId,
        tableName: "calendar_connections",
        rowId: existing.id as string,
        action: "update",
      });

      return { id: existing.id as string };
    }

    const { data: created, error } = await supabase
      .from("calendar_connections")
      .insert({ member_id: data.memberId, provider: "ics", ics_url: data.icsUrl, sync_tag: data.syncTag })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "calendar_connections",
      rowId: created.id as string,
      action: "insert",
    });

    return { id: created.id as string };
  });

/**
 * Fetches the ICS feed, parses it by tag, and upserts on (calendar_connection_id,
 * external_event_id) -- WITHOUT ever touching overlay_* (buildEventUpsertRows'
 * return type structurally excludes them). Shared verbatim between the
 * manual "Refresh now" button (below) and the scheduled cron (Task 29) --
 * one sync implementation, two callers with different privilege levels
 * appropriate to their context (a signed-in member's own session here; the
 * service-role client in the cron, which has no session at all).
 *
 * `connection.ics_url` is the first member-supplied URL this server ever
 * fetches (as opposed to only ever talking to Supabase or a fixed set of
 * known services) -- see MAX_ICS_BYTES/ICS_FETCH_TIMEOUT_MS/readBoundedText
 * above for the caps that exist specifically because of that. Deliberately
 * NOT in scope here: resolving the URL's DNS and blocking private/internal
 * IP ranges before fetching (classic SSRF-to-internal-network hardening).
 * That's a real, deeper hardening item, but Cloudflare Workers' own
 * `fetch()` sandboxing already substantially mitigates the "reach internal
 * cloud metadata/internal network" pattern a traditional VM-hosted server
 * would need this for -- deferred as a lower-priority follow-up, not
 * forgotten. If that hardening is ever built: `fetch()` follows
 * cross-origin redirects by default (confirmed live in review), so
 * validating only the initial URL would NOT be sufficient once IP-range
 * blocking exists -- it would need `redirect: "manual"` with per-hop
 * revalidation of each redirect target, not a one-time check of the
 * stored URL. No real exposure today: every redirect target is still
 * subject to the same http(s)-only restriction below, so this doesn't
 * widen the scheme attack surface, only (in the future) the IP-range one.
 *
 * The http(s)-scheme check below (validateIcsUrl) is deliberately run
 * HERE, inside this function's own try block -- not only in
 * saveIcsConnection's handler (which also runs it, as a faster-feedback
 * UX guard on the happy path; this call is the one that's actually load-
 * bearing). A signed-in member has direct Supabase REST access to their
 * own calendar_connections row (RLS's `is_member_editor` already permits
 * it), so a `file://`/`data:` URL can reach `ics_url` by a PATCH that
 * never goes through saveIcsConnection at all -- and the not-yet-built
 * Task 29 cron calls this exact function with the service-role client
 * against whatever is actually stored, with no createServerFn handler in
 * front of it to re-validate first. Checking it here, inside the same
 * try/catch that already records every other failure mode to
 * sync_status/last_sync_error, means a bad stored URL fails the same
 * graceful way regardless of how it got into the row.
 */
export async function syncOneIcsConnection(supabase: SupabaseClient, connection: CalendarConnectionRow): Promise<void> {
  if (!connection.ics_url || !connection.sync_tag) return;

  try {
    const urlCheck = validateIcsUrl(connection.ics_url);
    if (!urlCheck.valid) throw new Error(urlCheck.reason);

    let response: Response;
    try {
      response = await fetch(connection.ics_url, { signal: AbortSignal.timeout(ICS_FETCH_TIMEOUT_MS) });
    } catch (err) {
      throw toFriendlyFetchError(err);
    }
    if (!response.ok) throw new Error(`ICS feed responded with ${response.status}`);

    // Fast-path early exit when the server is honest about size -- the
    // real bound is readBoundedText below, since Content-Length isn't
    // always sent and can't be fully trusted (see readBoundedText's doc
    // comment). Cancels the body rather than just discarding the
    // response, so the connection is actually torn down instead of left
    // to keep receiving bytes in the background after this has already
    // decided to fail.
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_ICS_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `The calendar feed is larger than the ${Math.round(MAX_ICS_BYTES / (1024 * 1024))}MB limit.`,
      );
    }

    let icsText: string;
    try {
      // The same AbortSignal governs the response body stream, not just
      // the initial connection -- a timeout that fires mid-stream throws
      // out of readBoundedText's reader.read() loop the same way it does
      // out of fetch() itself, so this needs the same friendly-message
      // conversion. See toFriendlyFetchError's doc comment.
      icsText = await readBoundedText(response, MAX_ICS_BYTES);
    } catch (err) {
      throw toFriendlyFetchError(err);
    }

    const parsedEvents = parseIcsFeedForTag(icsText, connection.sync_tag);
    const rows = buildEventUpsertRows(connection.member_id, connection.id, parsedEvents);

    if (rows.length > 0) {
      const { error: upsertError } = await supabase.from("events").upsert(rows, { onConflict: "calendar_connection_id,external_event_id" });
      if (upsertError) throw upsertError;
    }

    await supabase.from("calendar_connections").update({ last_synced_at: new Date().toISOString(), last_sync_error: null, sync_status: "ok" }).eq("id", connection.id);
  } catch (err) {
    // Capped -- the ICS parser's own thrown messages (and some raw fetch
    // errors) can echo back attacker/misconfiguration-controlled feed
    // content verbatim. Low severity on its own (a member can only ever
    // point this at their own feed, and this is stored text rendered
    // through React's normal escaping, not markup), but there's no reason
    // to let an unbounded string land in this column regardless.
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await supabase.from("calendar_connections").update({ last_sync_error: message, sync_status: "failing" }).eq("id", connection.id);
  }
}

export const refreshIcsConnectionNow = createServerFn({ method: "POST" })
  .inputValidator((data: { connectionId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: connection, error } = await supabase.from("calendar_connections").select("*").eq("id", data.connectionId).single();
    if (error || !connection) throw new Error("Calendar connection not found.");
    await syncOneIcsConnection(supabase, connection as CalendarConnectionRow);

    // syncOneIcsConnection itself stays free of impersonation-specific
    // logic -- it's shared verbatim with the Task 29 cron, which runs on
    // the service-role client with no session/request context at all, so
    // recordAuditLogIfImpersonating couldn't run there anyway. Logged here
    // instead, once per "Refresh now" click, against the connection row it
    // just wrote (whether the sync itself succeeded or failed -- either
    // way this handler's caller is a signed-in member's own session write
    // to calendar_connections, same as saveIcsConnection's two branches
    // above).
    await recordAuditLogIfImpersonating({
      memberId: (connection as CalendarConnectionRow).member_id,
      tableName: "calendar_connections",
      rowId: data.connectionId,
      action: "update",
    });

    // syncOneIcsConnection swallows every failure into the row itself
    // (sync_status/last_sync_error) rather than throwing -- deliberately,
    // so one bad feed can't interrupt the Task 29 cron's batch run. That
    // means this always resolves regardless of whether the sync actually
    // succeeded, so returning a bare {ok: true} here would make a failed
    // "Refresh now" look identical to a successful one to the caller.
    // Re-select and return the row so CalendarConnectionPanel's
    // onRefreshNow can show the real, current sync_status/last_sync_error
    // immediately, instead of the member only discovering a failure on a
    // later page reload.
    const { data: refreshed, error: refetchError } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("id", data.connectionId)
      .single();
    if (refetchError || !refreshed) throw new Error("Calendar connection not found.");
    return refreshed as CalendarConnectionRow;
  });
