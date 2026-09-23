import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { EventOverlayStatus, EventRow } from "@/lib/supabase/types";

export const listEvents = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("member_id", data.memberId)
      .order("starts_at");
    if (error) throw new Error(error.message);
    return events as EventRow[];
  });

type HandEnteredEventInput = {
  title: string | null;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  city: string | null;
  address: string | null;
};

export const createEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string } & HandEnteredEventInput) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // No row-count check needed here (unlike every mutation below) --
    // an INSERT whose `with check` RLS policy rejects it raises a real
    // Postgres error, it doesn't silently report success with zero rows.
    // That silent-zero-rows gap is specific to UPDATE/DELETE.
    const { data: row, error } = await supabase
      .from("events")
      .insert({
        member_id: data.memberId,
        source: "manual",
        title: data.title,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        venue_name: data.venueName,
        city: data.city,
        address: data.address,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "events",
      rowId: (row as EventRow).id,
      action: "insert",
    });

    return row as EventRow;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; patch: Partial<HandEnteredEventInput> }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- same gotcha cover.server.ts's
    // updateCoverAsset/updateCoverCrop and member-basics.server.ts's
    // updateMemberBasics guard against: PostgREST reports an RLS-denied
    // UPDATE as success (`error: null`) with zero rows affected, not as
    // an `error`. Without this, a write blocked by RLS would silently
    // report success back to EventsEditor's optimistic UI, leaving the
    // client and server permanently out of sync with no visible failure.
    //
    // The object below only ever sets the keys present in data.patch --
    // any key `data.patch` doesn't have is `undefined` here, and
    // @supabase/postgrest-js serializes the request body with
    // JSON.stringify, which drops undefined-valued keys entirely. So an
    // unset patch field never reaches the database; this is a legitimate
    // partial-update pattern, not a bug.
    const { data: updated, error } = await supabase
      .from("events")
      .update({
        title: data.patch.title,
        starts_at: data.patch.startsAt,
        ends_at: data.patch.endsAt,
        venue_name: data.patch.venueName,
        city: data.patch.city,
        address: data.patch.address,
      })
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this event.");
    }

    await recordAuditLogIfImpersonating({
      memberId: updated[0].member_id as string,
      tableName: "events",
      rowId: data.id,
      action: "update",
    });

    return { ok: true as const };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // Same row-count check as updateEvent above -- DELETE has the exact
    // same silent-zero-rows-on-RLS-denial behavior as UPDATE.
    const { data: deleted, error } = await supabase
      .from("events")
      .delete()
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Delete failed — you may not have permission to delete this event.");
    }

    await recordAuditLogIfImpersonating({
      memberId: deleted[0].member_id as string,
      tableName: "events",
      rowId: data.id,
      action: "delete",
    });

    return { ok: true as const };
  });

/**
 * A direct, member-initiated overlay write -- unlike the ICS re-sync path
 * (Task 26), this is exactly where overlay_* columns are SUPPOSED to be
 * written. Contrast against buildEventUpsertRows, which must never include
 * them.
 */
export const setEventOverlay = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; status: EventOverlayStatus; newStartsAt?: string; note?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // Same row-count check as updateEvent above.
    const { data: updated, error } = await supabase
      .from("events")
      .update({
        overlay_status: data.status,
        overlay_starts_at: data.status === "rescheduled" ? data.newStartsAt ?? null : null,
        overlay_note: data.note ?? null,
        overlay_set_at: new Date().toISOString(),
      })
      .eq("id", data.eventId)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this event.");
    }

    await recordAuditLogIfImpersonating({
      memberId: updated[0].member_id as string,
      tableName: "events",
      rowId: data.eventId,
      action: "update",
    });

    return { ok: true as const };
  });

export const clearEventOverlay = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // Same row-count check as updateEvent above.
    const { data: updated, error } = await supabase
      .from("events")
      .update({ overlay_status: null, overlay_starts_at: null, overlay_note: null, overlay_set_at: null })
      .eq("id", data.eventId)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this event.");
    }

    await recordAuditLogIfImpersonating({
      memberId: updated[0].member_id as string,
      tableName: "events",
      rowId: data.eventId,
      action: "update",
    });

    return { ok: true as const };
  });

export const toggleEventHidden = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; isHidden: boolean }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // Same row-count check as updateEvent above.
    const { data: updated, error } = await supabase
      .from("events")
      .update({ is_hidden: data.isHidden })
      .eq("id", data.eventId)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this event.");
    }

    await recordAuditLogIfImpersonating({
      memberId: updated[0].member_id as string,
      tableName: "events",
      rowId: data.eventId,
      action: "update",
    });

    return { ok: true as const };
  });
