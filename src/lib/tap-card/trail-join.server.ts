import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isHoneypotTripped } from "@/lib/contact/contact-form-validation";
import { SOMETHING_WRONG, rateLimitMessage } from "@/lib/join/join-guards.server";
import { normalizeCardCode } from "@/lib/tap-card/card-code";
import { clearTrailJoin, readHolderId, readTrailJoin, setTrailJoinCookie, startHolderSession } from "@/lib/tap-card/tap-card-cookies.server";
import { passLines } from "@/lib/tap-card/zeffy";
import { zeffyPaymentsSince } from "@/lib/tap-card/zeffy.server";
import { decideJoinedView, recordZeffyPayment } from "@/lib/tap-card/trail-pass-core";
import { validateTrailJoin } from "@/lib/tap-card/trail-join";
import { activeCampaign, countOtherJoins, plateMember, trailPassStore } from "@/lib/tap-card/trail-pass-store.server";

/** Joining the Beer Trail (spec 2026-11-19): our page first (brewery + email + opt-in), then Zeffy. */

/** emailLocked: signed in -- the pass must go on this card, so the email is the card's own. */
export type TrailJoinPage = { open: boolean; year: number | null; memberName: string | null; plateCode: string | null; email: string; emailLocked: boolean };

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
    return { open: campaign !== null, year: campaign?.year ?? null, memberName: plate?.memberName ?? null, plateCode: plate?.code ?? null, email, emailLocked: email !== "" };
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
      // Signed in: the pass goes on this card, whatever was typed.
      const holderId = await readHolderId();
      if (holderId) {
        const service = await getSupabaseServiceRoleClient();
        const { data: h } = await service.from("tap_card_holders").select("email").eq("id", holderId).maybeSingle();
        if (h?.email) data = { ...data, email: h.email as string };
      }
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

export type TrailJoinedResult = { kind: "no-join" } | { kind: "waiting" } | { kind: "signed-in"; next: string } | { kind: "need-code"; email: string; next: string };

/**
 * /trail/joined: finish this browser's sign-up. Doesn't wait for the webhook --
 * looks the payment up in Zeffy itself and records it the same idempotent way.
 */
export const finishTrailJoin = createServerFn({ method: "POST" }).handler(async (): Promise<TrailJoinedResult> => {
  const service = await getSupabaseServiceRoleClient();
  const join = await readTrailJoin(service);
  if (!join) return { kind: "no-join" };
  const campaign = await activeCampaign(service);
  let recorded = null;
  let claim = null;
  if (campaign) {
    const email = join.email.toLowerCase();
    // Only payments made after this sign-up (a little clock slack): never one someone else made earlier.
    const payments = await zeffyPaymentsSince(campaign.zeffyCampaignId, new Date(join.createdAt.getTime() - 2 * 60_000));
    const mine = payments
      .filter((p) => p.succeeded && !p.refunded && passLines(p).some((l) => l.email.toLowerCase() === email))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (mine) {
      const result = await recordZeffyPayment(trailPassStore(service), mine, new Date());
      if (result.kind === "recorded") {
        recorded = result.passes;
        const otherJoins = await countOtherJoins(
          service,
          email,
          join.id,
          new Date(mine.createdAt.getTime() - 2 * 60 * 60_000),
          new Date(mine.createdAt.getTime() + 5 * 60_000),
        );
        claim = { paymentAt: mine.createdAt, otherJoins };
      }
    }
  }
  const view = decideJoinedView({ join, recorded, claim, currentHolderId: await readHolderId() });
  if (view.kind === "signed-in") {
    await startHolderSession(view.holderId);
    clearTrailJoin();
    return { kind: "signed-in", next: view.next };
  }
  return view;
});
