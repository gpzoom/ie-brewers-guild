import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import {
  loadFoodCalendarIfProducer,
  type FoodCalendarData,
} from "@/lib/portal/section-data.server";

/**
 * A producer's food calendar for the old /admin/events screen (the portal
 * and wizard load it with their Events data). Read through the signed-in
 * session, so RLS limits it to people who can edit this member -- the
 * member, their editors, or a Guild admin editing as them. Null for a
 * member who isn't a producer.
 */
export const getFoodCalendar = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<FoodCalendarData | null> => {
    const supabase = await getSupabaseServerClientForRequest();
    return loadFoodCalendarIfProducer(supabase, data.memberId);
  });
