import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import { loadGuestStopRows } from "@/lib/events/guest-info";
import type { GuestStopRow } from "@/lib/events/guest-stops";
import type { GuestStopsMode } from "@/lib/supabase/types";

/**
 * Guild Mobile members at taprooms (artboard GV1): the taproom's own list
 * of Guild members' stops there, with Hide/Show, Approve/Decline, and its
 * "Ask me first" setting (Part 2). Session client: RLS lets the host's
 * people (and Guild admins) read every link of theirs.
 */
export const listGuestStops = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(
    async ({ data }): Promise<{ street: string | null; stops: GuestStopRow[]; mode: GuestStopsMode; canChangeMode: boolean }> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Please sign in again.");
    const [stops, memberResult, editorResult] = await Promise.all([
      loadGuestStopRows(supabase, data.memberId, new Date()).catch(() => {
        throw new Error("Couldn't load the Guild members at your taproom.");
      }),
      supabase.from("members").select("street_address, guest_stops_mode").eq("id", data.memberId).maybeSingle(),
      // Only the owner and full editors (or a Guild admin) choose the setting.
      supabase.rpc("is_member_full_editor", { target_member_id: data.memberId }),
    ]);
    const street = (memberResult.data?.street_address as string | null | undefined) ?? null;
    const mode: GuestStopsMode = memberResult.data?.guest_stops_mode === "ask" ? "ask" : "show";
    return { street, stops, mode, canChangeMode: editorResult.data === true };
  },
  );

export const setGuestStopStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; eventId: string; status: "shown" | "hidden" | "declined" }) => {
    if (data.status !== "shown" && data.status !== "hidden" && data.status !== "declined") throw new Error("Unknown status.");
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

/** Show right away or Ask me first (Part 2): saved straight away, audited for a Guild admin editing as them. */
export const setGuestStopsMode = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; mode: GuestStopsMode }) => {
    if (data.mode !== "show" && data.mode !== "ask") throw new Error("Unknown setting.");
    return data;
  })
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Please sign in again.");
    const { error } = await supabase.rpc("set_guest_stops_mode", { p_member_id: data.memberId, p_mode: data.mode });
    if (error) throw new Error("That didn't save — only the owner or a full editor can change this.");
    await recordAuditLogIfImpersonating({ memberId: data.memberId, tableName: "members", rowId: data.memberId, action: "update" });
    return { ok: true as const };
  });
