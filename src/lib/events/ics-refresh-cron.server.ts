import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { syncOneIcsConnection } from "@/lib/events/calendar-connection.server";
import type { CalendarConnectionRow } from "@/lib/supabase/types";

/**
 * Cap on simultaneous in-flight syncOneIcsConnection calls. Each one makes a
 * genuine outbound fetch against a member-supplied URL, with up to a 10s
 * timeout of its own (ICS_FETCH_TIMEOUT_MS in calendar-connection.server.ts,
 * Task 27) -- a fully sequential loop over every ICS connection could
 * therefore take (connection count * up to 10s) to finish, risking this
 * scheduled Worker invocation being killed by the platform's execution
 * limit before every connection gets synced, with nothing surfaced anywhere
 * when that happens (later connections in the loop just silently never
 * run). Fully unbounded parallelism (a bare Promise.all over every
 * connection with no batching) trades that risk for an unbounded number of
 * simultaneous outbound requests instead, which scales just as badly the
 * other direction as the guild's ICS connection count grows. Batching in
 * fixed-size slices bounds both at once.
 */
const CONCURRENCY_LIMIT = 5;

/**
 * The scheduled half of ICS sync (spec: "a scheduled refresh every fifteen
 * minutes"). Runs with no user session at all -- the service-role client
 * is correct here, unlike everywhere else in this plan (Decision 5).
 */
export async function refreshAllIcsConnections(): Promise<void> {
  const supabase = await getSupabaseServiceRoleClient();
  const { data: connections, error } = await supabase.from("calendar_connections").select("*").eq("provider", "ics");
  if (error || !connections) {
    console.error("refreshAllIcsConnections: failed to list connections", error);
    return;
  }

  const rows = connections as CalendarConnectionRow[];
  // syncOneIcsConnection already catches every failure internally and never
  // throws (Task 27), so a batch's Promise.all can never reject because of
  // an individual connection's sync failure -- no extra error handling
  // needed around the batching loop itself.
  for (let i = 0; i < rows.length; i += CONCURRENCY_LIMIT) {
    const batch = rows.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(batch.map((connection) => syncOneIcsConnection(supabase, connection)));
  }
}
