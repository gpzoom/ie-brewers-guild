import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { effectiveOffer, validateOfferText } from "@/lib/tap-card/offers";
import type { TapCardOfferStatus } from "@/lib/supabase/types";

/**
 * Offers: a brewer writes their own (Portal/Admin > Tap Card); it waits for
 * a Guild admin's OK (Guild > Tap Card > Offers). Editing an approved offer
 * sends it back to waiting, and the standard offer shows meanwhile.
 */

async function requireOfferEditor(memberId: string) {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("Please sign in again.");
  const { data: allowed, error } = await supabase.rpc("is_member_full_editor", { target_member_id: memberId });
  if (error) throw new Error(error.message);
  if (allowed !== true) throw new Error("Only the owner or a full editor can change the offer.");
  return { userId: auth.user.id, service: await getSupabaseServiceRoleClient() };
}

export type MemberOffer = { showing: string; own: { offerText: string; status: TapCardOfferStatus } | null };

export const getMemberOffer = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<MemberOffer> => {
    const { service } = await requireOfferEditor(data.memberId);
    const { data: row, error } = await service
      .from("tap_card_offers")
      .select("offer_text, status")
      .eq("member_id", data.memberId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const own = row ? { offerText: row.offer_text, status: row.status as TapCardOfferStatus } : null;
    return { showing: effectiveOffer(own), own };
  });

/** offerText null = go back to the standard offer. */
export const submitOffer = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; offerText: string | null }) => ({
    memberId: String(data?.memberId ?? ""),
    offerText: typeof data?.offerText === "string" ? data.offerText : null,
  }))
  .handler(async ({ data }): Promise<{ status: "pending" | "standard" }> => {
    const { userId, service } = await requireOfferEditor(data.memberId);
    if (data.offerText === null) {
      const { error } = await service.from("tap_card_offers").delete().eq("member_id", data.memberId);
      if (error) throw new Error(error.message);
      return { status: "standard" };
    }
    const checked = validateOfferText(data.offerText);
    if (!checked.ok) throw new Error(checked.message);
    const { error } = await service.from("tap_card_offers").upsert({
      member_id: data.memberId,
      offer_text: checked.text,
      status: "pending",
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
    });
    if (error) throw new Error(error.message);
    return { status: "pending" };
  });

export type PendingOffer = { memberId: string; memberName: string; offerText: string; submittedAt: string };

export const listPendingOffers = createServerFn({ method: "GET" }).handler(async (): Promise<PendingOffer[]> => {
  const { service } = await requireTapCardGuildAdmin();
  const { data, error } = await service
    .from("tap_card_offers")
    .select("member_id, offer_text, submitted_at, members(business_name)")
    .eq("status", "pending")
    .order("submitted_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    memberId: r.member_id,
    memberName: (r.members as unknown as { business_name: string } | null)?.business_name ?? "",
    offerText: r.offer_text,
    submittedAt: r.submitted_at,
  }));
});

export const reviewOffer = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; approve: boolean }) => ({
    memberId: String(data?.memberId ?? ""),
    approve: data?.approve === true,
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId, service } = await requireTapCardGuildAdmin();
    const { error } = await service
      .from("tap_card_offers")
      .update({ status: data.approve ? "approved" : "declined", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("member_id", data.memberId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
