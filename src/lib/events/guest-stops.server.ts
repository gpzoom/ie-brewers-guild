import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import { loadGuestStopRows } from "@/lib/events/guest-info";
import type { GuestStopRow } from "@/lib/events/guest-stops";
import type { EventHostStatus } from "@/lib/supabase/types";

/**
 * Guild Mobile members at taprooms (artboard GV1): the taproom's own list
 * of Guild members' stops there, with Hide/Show. Session client: RLS lets
 * the host's people (and Guild admins) read every link of theirs.
 */
export const listGuestStops = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<{ street: string | null; stops: GuestStopRow[] }> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Please sign in again.");
    const [stops, memberResult] = await Promise.all([
      loadGuestStopRows(supabase, data.memberId, new Date()).catch(() => {
        throw new Error("Couldn't load the Guild members at your taproom.");
      }),
      supabase.from("members").select("street_address").eq("id", data.memberId).maybeSingle(),
    ]);
    const street = (memberResult.data?.street_address as string | null | undefined) ?? null;
    return { street, stops };
  });

export const setGuestStopStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; eventId: string; status: EventHostStatus }) => {
    if (data.status !== "shown" && data.status !== "hidden") throw new Error("Unknown status.");
    return data;
  })
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Please sign in again.");
    // set_event_host_status checks the caller is one of the host's people or a Guild admin.
    const { error } = await supabase.rpc("set_event_host_status", { p_event_id: data.eventId, p_status: data.status });
    if (error) throw new Error("That didn't save — you may not have permission to change this stop.");

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "event_hosts",
      rowId: data.eventId,
      action: "update",
    });

    return { ok: true as const };
  });
