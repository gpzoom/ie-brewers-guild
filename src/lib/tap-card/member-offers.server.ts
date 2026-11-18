import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TapCardMemberOfferRow } from "@/lib/supabase/types";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { DEFAULT_EXPIRY_DAYS, EXPIRY_CHOICES, validateMemberOffer, type OfferSlot } from "@/lib/tap-card/loyalty";
import { SLOT_ORDER, otherStepNumbers, slotViews, type OfferVersion, type SlotView } from "@/lib/tap-card/member-offers-view";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";

/**
 * Offers (Portal/Admin > Tap Card): the Guild's Beer Trail offer, which
 * breweries can't change, and the brewery's own loyalty rewards -- up to 3
 * steps and one repeating reward. Every reward and every change waits for a
 * Guild admin (Guild > Tap Card > Offers); the approved version stays live
 * while a change waits. Removing a reward needs no approval; rewards customers
 * already earned stay on their cards.
 */

const OFFER_COLUMNS =
  "id, member_id, slot, live_visit_number, live_reward, live_terms, live_approved_at, live_approved_by, draft_visit_number, draft_reward, draft_terms, draft_status, draft_submitted_at, draft_submitted_by, decline_note, created_at";

function asSlot(value: unknown): OfferSlot {
  if (typeof value === "string" && (SLOT_ORDER as readonly string[]).includes(value)) return value as OfferSlot;
  throw new Error("Unknown reward slot.");
}

async function loadRows(service: SupabaseClient, memberId: string): Promise<TapCardMemberOfferRow[]> {
  const { data, error } = await service.from("tap_card_member_offers").select(OFFER_COLUMNS).eq("member_id", memberId);
  if (error) throw new Error(error.message);
  return (data ?? []) as TapCardMemberOfferRow[];
}

export type MemberOffersData = {
  trailOffer: string;
  slots: SlotView[];
  expiryDays: number;
  templates: { id: string; title: string; reward: string; terms: string }[];
};

export const getMemberOffers = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<MemberOffersData> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const [rows, settings, templates] = await Promise.all([
      loadRows(service, data.memberId),
      service.from("tap_card_member_settings").select("reward_expiry_days").eq("member_id", data.memberId).maybeSingle(),
      service.from("tap_card_offer_templates").select("id, title, reward, terms").eq("hidden", false).order("sort_order").order("created_at"),
    ]);
    if (settings.error) throw new Error(settings.error.message);
    if (templates.error) throw new Error(templates.error.message);
    return {
      trailOffer: STANDARD_OFFER,
      slots: slotViews(rows),
      expiryDays: settings.data?.reward_expiry_days ?? DEFAULT_EXPIRY_DAYS,
      templates: templates.data ?? [],
    };
  });

export const submitMemberOffer = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; slot: OfferSlot; visitNumber: number; reward: string; terms: string }) => ({
    memberId: String(data?.memberId ?? ""),
    slot: asSlot(data?.slot),
    visitNumber: Number(data?.visitNumber),
    reward: String(data?.reward ?? ""),
    terms: String(data?.terms ?? ""),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId, service } = await requireTapCardEditor(data.memberId);
    const views = slotViews(await loadRows(service, data.memberId));
    const checked = validateMemberOffer(data, otherStepNumbers(views, data.slot, "live-and-draft"));
    if (!checked.ok) throw new Error(checked.message);
    const draft = {
      draft_visit_number: checked.value.visitNumber,
      draft_reward: checked.value.reward,
      draft_terms: checked.value.terms,
      draft_status: "pending",
      draft_submitted_at: new Date().toISOString(),
      draft_submitted_by: userId,
      decline_note: null,
    };
    const { error } = await service
      .from("tap_card_member_offers")
      .upsert({ member_id: data.memberId, slot: data.slot, ...draft }, { onConflict: "member_id,slot" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMemberOffer = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; slot: OfferSlot }) => ({ memberId: String(data?.memberId ?? ""), slot: asSlot(data?.slot) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const { error } = await service.from("tap_card_member_offers").delete().eq("member_id", data.memberId).eq("slot", data.slot);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Takes back a waiting (or declined) change; a reward that was never approved goes away entirely. */
export const withdrawMemberOfferDraft = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; slot: OfferSlot }) => ({ memberId: String(data?.memberId ?? ""), slot: asSlot(data?.slot) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const view = slotViews(await loadRows(service, data.memberId)).find((v) => v.slot === data.slot);
    if (!view?.id) return { ok: true };
    const query = view.live
      ? service
          .from("tap_card_member_offers")
          .update({
            draft_visit_number: null,
            draft_reward: null,
            draft_terms: null,
            draft_status: null,
            draft_submitted_at: null,
            draft_submitted_by: null,
            decline_note: null,
          })
          .eq("id", view.id)
      : service.from("tap_card_member_offers").delete().eq("id", view.id);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveRewardExpiry = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; days: number }) => ({ memberId: String(data?.memberId ?? ""), days: Number(data?.days) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (!(EXPIRY_CHOICES as readonly number[]).includes(data.days)) throw new Error("Pick one of the listed lengths.");
    const { service } = await requireTapCardEditor(data.memberId);
    const { error } = await service
      .from("tap_card_member_settings")
      .upsert({ member_id: data.memberId, reward_expiry_days: data.days }, { onConflict: "member_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PendingMemberOffer = {
  id: string;
  memberId: string;
  memberName: string;
  slot: OfferSlot;
  draft: OfferVersion;
  live: OfferVersion | null;
  submittedAt: string;
};

export const listPendingMemberOffers = createServerFn({ method: "GET" }).handler(async (): Promise<PendingMemberOffer[]> => {
  const { service } = await requireTapCardGuildAdmin();
  const { data, error } = await service
    .from("tap_card_member_offers")
    .select(`${OFFER_COLUMNS}, members(business_name)`)
    .eq("draft_status", "pending")
    .order("draft_submitted_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as unknown as TapCardMemberOfferRow & { members: { business_name: string } | null };
    const view = slotViews([row]).find((v) => v.slot === row.slot)!;
    return {
      id: row.id,
      memberId: row.member_id,
      memberName: row.members?.business_name ?? "",
      slot: row.slot,
      draft: { visitNumber: view.draft!.visitNumber, reward: view.draft!.reward, terms: view.draft!.terms },
      live: view.live,
      submittedAt: row.draft_submitted_at ?? row.created_at,
    };
  });
});

/**
 * Approve: the waiting change becomes the live version (re-checked first, in
 * case another step took its visit number since it was sent). Decline: it
 * stays on the brewery's screen with the note; the live version is untouched.
 */
export const reviewMemberOffer = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; approve: boolean; note: string }) => ({
    id: String(data?.id ?? ""),
    approve: data?.approve === true,
    note: String(data?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId, service } = await requireTapCardGuildAdmin();
    const { data: found, error } = await service.from("tap_card_member_offers").select(OFFER_COLUMNS).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    const row = found as TapCardMemberOfferRow | null;
    if (!row || row.draft_status !== "pending" || row.draft_visit_number === null || row.draft_reward === null) {
      throw new Error("That change isn't waiting any more.");
    }
    if (!data.approve) {
      const { error: declineError } = await service
        .from("tap_card_member_offers")
        .update({ draft_status: "declined", decline_note: data.note || null })
        .eq("id", row.id)
        .eq("draft_status", "pending");
      if (declineError) throw new Error(declineError.message);
      return { ok: true };
    }
    const views = slotViews(await loadRows(service, row.member_id));
    const checked = validateMemberOffer(
      { slot: row.slot, visitNumber: row.draft_visit_number, reward: row.draft_reward, terms: row.draft_terms ?? "" },
      otherStepNumbers(views, row.slot, "live"),
    );
    if (!checked.ok) throw new Error(checked.message);
    const { error: approveError } = await service
      .from("tap_card_member_offers")
      .update({
        live_visit_number: checked.value.visitNumber,
        live_reward: checked.value.reward,
        live_terms: checked.value.terms,
        live_approved_at: new Date().toISOString(),
        live_approved_by: userId,
        draft_visit_number: null,
        draft_reward: null,
        draft_terms: null,
        draft_status: null,
        draft_submitted_at: null,
        draft_submitted_by: null,
        decline_note: null,
      })
      .eq("id", row.id)
      .eq("draft_status", "pending")
      .eq("draft_reward", row.draft_reward);
    if (approveError) throw new Error(approveError.message);
    return { ok: true };
  });
