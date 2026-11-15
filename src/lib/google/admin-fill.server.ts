import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { loadMemberDraftBundle, touchImpersonation } from "@/lib/drafts/drafts.server";
import { normalizeSections, type DraftSection } from "@/lib/drafts/sections";
import { validateDraftPatch } from "@/lib/drafts/validate-patch";
import { computeFillPatch, type FillField } from "@/lib/google/fill-patch";
import { mapPlaceToProfile } from "@/lib/google/place-profile";
import { getPlaceDetails, searchPlaces, type PlaceCandidate } from "@/lib/google/places-client.server";

/**
 * Guild admins' "Fill from Google" on a member's Basics page. Everything runs
 * through the signed-in session client (the same RPC the editors use), so the
 * database's own role checks and audit rows apply. No email is sent.
 */

type SessionClient = Awaited<ReturnType<typeof getSupabaseServerClientForRequest>>;

async function requireGuildAdmin(supabase: SessionClient) {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new Error("Not signed in.");
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_guild_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!(profile as { is_guild_admin?: boolean } | null)?.is_guild_admin) {
    throw new Error("Only Guild admins can fill from Google.");
  }
}

// memberId comes from the client: any Guild admin may fill any member (intentional).
export const adminSearchPlaces = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; query: string; city: string }) => data)
  .handler(async ({ data }): Promise<PlaceCandidate[]> => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireGuildAdmin(supabase);
    const query = data.query.trim();
    if (!query) throw new Error("Type the business name to search for.");
    return searchPlaces(query, data.city.trim());
  });

export type FillResult = {
  filled: FillField[];
  kept: FillField[];
  permanentlyClosed: boolean;
  dirtySections: DraftSection[];
};

export const adminFillFromGoogle = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; placeId: string }) => data)
  .handler(async ({ data }): Promise<FillResult> => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireGuildAdmin(supabase);

    const bundle = await loadMemberDraftBundle(supabase, data.memberId);
    const profile = mapPlaceToProfile(await getPlaceDetails(data.placeId));

    // A permanently closed place writes nothing (not even the place id);
    // the panel says so.
    if (profile.permanentlyClosed) {
      return { filled: [], kept: [], permanentlyClosed: true, dirtySections: bundle.dirtySections };
    }

    const plan = computeFillPatch(bundle.data.basics, bundle.data.links, profile);

    let dirtySections = bundle.dirtySections;
    const saves: { section: DraftSection; patch: Record<string, unknown> }[] = [];
    if (Object.keys(plan.basics).length > 0) saves.push({ section: "basics", patch: plan.basics });
    if (plan.links) saves.push({ section: "links", patch: { links: plan.links.links } });

    for (const save of saves) {
      const { section, patch } = validateDraftPatch(save.section, save.patch);
      const { data: row, error } = await supabase.rpc("save_member_draft_section", {
        p_member_id: data.memberId,
        p_section: section,
        p_data: patch,
      });
      if (error || !row) throw new Error(error?.message || "Couldn't save — try again.");
      dirtySections = normalizeSections((row as { dirty_sections: unknown }).dirty_sections);
    }

    const { error: placeError } = await supabase
      .from("members")
      .update({ google_place_id: profile.placeId })
      .eq("id", data.memberId);
    if (placeError) throw new Error(placeError.message || "Couldn't remember the Google match.");

    await touchImpersonation(data.memberId);
    return {
      filled: plan.filled,
      kept: plan.kept,
      permanentlyClosed: profile.permanentlyClosed,
      dirtySections,
    };
  });
