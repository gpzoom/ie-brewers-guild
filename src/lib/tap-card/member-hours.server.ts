import type { SupabaseClient } from "@supabase/supabase-js";
import { toSpecialHoursDay, toWeekdayHours } from "@/lib/hours/hours-rows";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";
import { dbFailed, readAllRows } from "@/lib/tap-card/plate-store.server";
import type { MemberHours } from "@/lib/tap-card/staff-activity";

const DEFAULT_TZ = "America/Los_Angeles";

/** A member's posted hours, for the "outside open hours" flag. No createServerFn here. */
export async function loadMemberHours(service: SupabaseClient, memberId: string): Promise<MemberHours> {
  const [member, hours, special] = await Promise.all([
    service.from("members").select("timezone").eq("id", memberId).maybeSingle(),
    readAllRows<Omit<HoursRow, "id" | "member_id">>((from, to) =>
      service.from("hours").select("weekday, opens_at, closes_at, closes_next_day, is_closed").eq("member_id", memberId).order("weekday").order("id").range(from, to),
    ),
    readAllRows<Omit<SpecialHoursRow, "id" | "member_id">>((from, to) =>
      service
        .from("special_hours")
        .select("date, is_closed, opens_at, closes_at, closes_next_day, note")
        .eq("member_id", memberId)
        .order("date")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (member.error) throw dbFailed(member.error);
  const timezone = member.data?.timezone || DEFAULT_TZ;
  // No weekly hours posted: nothing is ever "outside hours", special days included.
  if (hours.length === 0) return { timezone, hours: [], specialHours: [] };
  return { timezone, hours: toWeekdayHours(hours as HoursRow[]), specialHours: toSpecialHoursDay(special as SpecialHoursRow[]) };
}
