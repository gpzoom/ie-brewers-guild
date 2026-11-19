import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isHoneypotTripped } from "@/lib/contact/contact-form-validation";
import { SOMETHING_WRONG, rateLimitMessage } from "@/lib/join/join-guards.server";
import { normalizeCardCode } from "@/lib/tap-card/card-code";
import { readHolderId, setTrailJoinCookie } from "@/lib/tap-card/tap-card-cookies.server";
import { validateTrailJoin } from "@/lib/tap-card/trail-join";
import { activeCampaign } from "@/lib/tap-card/trail-pass-store.server";

/** Joining the Beer Trail (spec 2026-11-19): our page first (brewery + email + opt-in), then Zeffy. */

async function plateMember(service: SupabaseClient, rawCode: string | null): Promise<{ memberId: string; memberName: string; code: string } | null> {
  const code = rawCode ? normalizeCardCode(rawCode) : null;
  if (!code) return null;
  const { data, error } = await service.from("tap_card_plates").select("member_id, members!inner(business_name)").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { memberId: data.member_id as string, memberName: (data.members as unknown as { business_name: string }).business_name, code };
}

export type TrailJoinPage = { open: boolean; year: number | null; memberName: string | null; plateCode: string | null; email: string };

export const getTrailJoinPage = createServerFn({ method: "GET" })
  .inputValidator((data: { plate?: string }) => ({ plate: typeof data?.plate === "string" ? data.plate : null }))
  .handler(async ({ data }): Promise<TrailJoinPage> => {
    const service = await getSupabaseServiceRoleClient();
    const [campaign, plate, holderId] = await Promise.all([activeCampaign(service), plateMember(service, data.plate), readHolderId()]);
    let email = "";
    if (holderId) {
      const { data: h } = await service.from("tap_card_holders").select("email").eq("id", holderId).maybeSingle();
      email = (h?.email as string | undefined) ?? "";
    }
    return { open: campaign !== null, year: campaign?.year ?? null, memberName: plate?.memberName ?? null, plateCode: plate?.code ?? null, email };
  });

export const startTrailJoin = createServerFn({ method: "POST" })
  .inputValidator((data: { plateCode: string | null; email: string; ageConfirmed: boolean; optIn: boolean; website: string }) => ({
    plateCode: typeof data?.plateCode === "string" ? data.plateCode : null,
    email: String(data?.email ?? "").trim(),
    ageConfirmed: data?.ageConfirmed === true,
    optIn: data?.optIn === true,
    website: String(data?.website ?? ""),
  }))
  .handler(async ({ data }): Promise<{ kind: "go"; url: string } | { kind: "error"; message: string; field?: "email" | "ageConfirmed" }> => {
    try {
      const errors = validateTrailJoin(data);
      if (errors.email) return { kind: "error", message: errors.email, field: "email" };
      if (errors.ageConfirmed) return { kind: "error", message: errors.ageConfirmed, field: "ageConfirmed" };
      const limited = await rateLimitMessage("tapcard-join");
      if (limited) return { kind: "error", message: limited };
      const service = await getSupabaseServiceRoleClient();
      const campaign = await activeCampaign(service);
      if (!campaign) return { kind: "error", message: "The Beer Trail isn't taking sign-ups right now." };
      if (isHoneypotTripped(data.website)) return { kind: "go", url: campaign.formUrl };
      const plate = await plateMember(service, data.plateCode);
      const { data: join, error } = await service
        .from("tap_card_trail_joins")
        .insert({ member_id: plate?.memberId ?? null, email: data.email, opt_in: Boolean(plate) && data.optIn })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      // Names this browser's sign-up, so the return page can finish it. A random id: the key to auto sign-in.
      setTrailJoinCookie(`${join.id}.${plate?.code ?? ""}`);
      return { kind: "go", url: campaign.formUrl };
    } catch (err) {
      console.error("startTrailJoin failed", err instanceof Error ? err.message : String(err));
      return { kind: "error", message: SOMETHING_WRONG };
    }
  });
