import type { SupabaseClient } from "@supabase/supabase-js";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";

/** The offer a stop shows. Task 8 replaces this with the Guild-approved offer. */
export async function offerForMember(_service: SupabaseClient, _memberId: string): Promise<string> {
  return STANDARD_OFFER;
}
