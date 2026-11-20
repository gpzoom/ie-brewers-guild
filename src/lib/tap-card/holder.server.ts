import { createServerFn } from "@tanstack/react-start";
import { safeHolderNext } from "@/lib/tap-card/plate";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { sendHolderSignInLink, signInCodeStore } from "@/lib/tap-card/holder-signin.server";
import { SIGNIN_CODE_MAX_TRIES, normalizeSignInCode, verifySignInCode } from "@/lib/tap-card/signin-code";
import { isHoneypotTripped } from "@/lib/contact/contact-form-validation";
import { SOMETHING_WRONG, rateLimitMessage } from "@/lib/join/join-guards.server";
import { normalizeCardCode } from "@/lib/tap-card/card-code";
import { deactivateCardCore } from "@/lib/tap-card/deactivate-core";
import { buildHolderView, type HolderCardView } from "@/lib/tap-card/holder-view";
import { tapCardYear } from "@/lib/tap-card/tap-card-time";
import { loadTrailStops } from "@/lib/tap-card/trail-stops.server";
import { canJoinTrail, holderHasTrailPass } from "@/lib/tap-card/trail-pass-store.server";
import {
  endHolderSession,
  readHolderId,
  startHolderSession,
} from "@/lib/tap-card/tap-card-cookies.server";

/**
 * Card holders' own sign-in and /card page. Separate from member sign-in:
 * a single-use emailed link → a tap_card_sessions cookie. The answer to
 * "send me a link" never says whether the email has a card.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const requestHolderSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; website: string; next?: string }) => ({
    email: String(data?.email ?? "").trim().toLowerCase(),
    website: String(data?.website ?? ""),
    next: safeHolderNext(data?.next),
  }))
  .handler(async ({ data }): Promise<{ kind: "check-email" } | { kind: "error"; message: string }> => {
    try {
      const limited = await rateLimitMessage("tapcard-signin");
      if (limited) return { kind: "error", message: limited };
      if (!EMAIL_PATTERN.test(data.email) || data.email.length > 320) {
        return { kind: "error", message: "Enter a valid email address." };
      }
      if (isHoneypotTripped(data.website)) return { kind: "check-email" };
      const service = await getSupabaseServiceRoleClient();
      const { data: holder, error } = await service.from("tap_card_holders").select("id").eq("email_lower", data.email).maybeSingle();
      if (error) throw new Error(error.message);
      if (holder) await sendHolderSignInLink(service, holder.id, data.email, data.next);
      return { kind: "check-email" };
    } catch (err) {
      console.error("requestHolderSignIn failed", err instanceof Error ? err.message : String(err));
      return { kind: "error", message: SOMETHING_WRONG };
    }
  });

/**
 * The emailed 6-digit code, typed in: works once, within the hour; 5 wrong
 * tries end it. Like the request, never says whether the email has a card.
 */
export const signInWithCode = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; code: string }) => ({
    email: String(data?.email ?? "").trim().toLowerCase(),
    code: normalizeSignInCode(data?.code),
  }))
  .handler(async ({ data }): Promise<{ kind: "ok" } | { kind: "error"; message: string }> => {
    try {
      const limited = await rateLimitMessage("tapcard-signin");
      if (limited) return { kind: "error", message: limited };
      if (!data.code) return { kind: "error", message: "Enter the 6 digits from the email." };
      const expired = "That code has expired or was already used. Send a new one.";
      if (!EMAIL_PATTERN.test(data.email) || data.email.length > 320) return { kind: "error", message: expired };
      const service = await getSupabaseServiceRoleClient();
      const { data: holder, error } = await service.from("tap_card_holders").select("id").eq("email_lower", data.email).maybeSingle();
      if (error) throw new Error(error.message);
      if (!holder) return { kind: "error", message: expired };
      const result = await verifySignInCode(signInCodeStore(service, holder.id), data.code);
      switch (result.kind) {
        case "ok":
          await startHolderSession(holder.id);
          return { kind: "ok" };
        case "wrong":
          return { kind: "error", message: `That code isn't right. ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left.` };
        case "too-many":
          return { kind: "error", message: `That was ${SIGNIN_CODE_MAX_TRIES} wrong tries, so the code has stopped working. Send a new one.` };
        case "busy":
          return { kind: "error", message: "One moment, then try again." };
        case "expired":
          return { kind: "error", message: expired };
      }
    } catch (err) {
      console.error("signInWithCode failed", err instanceof Error ? err.message : String(err));
      return { kind: "error", message: SOMETHING_WRONG };
    }
  });

/** The emailed link: works once, within the hour. */
export const consumeHolderLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!data.token || data.token.length > 100) return { ok: false };
    const service = await getSupabaseServiceRoleClient();
    const now = new Date().toISOString();
    // Mark used and read in one step, so the same link can't be used twice.
    const { data: rows, error } = await service
      .from("tap_card_login_tokens")
      .update({ used_at: now })
      .eq("token_hash", await hashUploadToken(data.token))
      .is("used_at", null)
      .gt("expires_at", now)
      .select("holder_id");
    if (error) throw new Error(error.message);
    const holderId = rows?.[0]?.holder_id;
    if (!holderId) return { ok: false };
    await startHolderSession(holderId);
    return { ok: true };
  });

export const getHolderCard = createServerFn({ method: "GET" }).handler(async (): Promise<HolderCardView | null> => {
  const holderId = await readHolderId();
  if (!holderId) return null;
  const service = await getSupabaseServiceRoleClient();
  const year = tapCardYear(new Date());
  const nowIso = new Date().toISOString();
  const [holder, stops, visits, milestones, rewards, cards, allVisits, waiting, joinable, trailPass] = await Promise.all([
    service.from("tap_card_holders").select("name").eq("id", holderId).maybeSingle(),
    loadTrailStops(service),
    service.from("tap_card_visits").select("member_id, visit_day, redeemed_year").eq("holder_id", holderId).gte("visit_day", `${year}-01-01`),
    service.from("tap_card_milestones").select("id, stops_required, reward_text").eq("active", true),
    service.from("tap_card_rewards").select("milestone_id, year, handed_out_at").eq("holder_id", holderId).eq("year", year),
    service.from("tap_cards").select("code").eq("holder_id", holderId).is("deactivated_at", null).order("activated_at"),
    service.from("tap_card_visits").select("member_id, visit_day, members(business_name)").eq("holder_id", holderId),
    service
      .from("tap_card_earned_rewards")
      .select("reward, terms, expires_at, members(business_name)")
      .eq("holder_id", holderId)
      .is("used_at", null)
      .gt("expires_at", nowIso),
    canJoinTrail(service, holderId),
    holderHasTrailPass(service, holderId, year),
  ]);
  for (const r of [holder, visits, milestones, rewards, cards, allVisits, waiting]) if (r.error) throw new Error(r.error.message);
  const nameOf = (m: unknown) => (m as { business_name: string } | null)?.business_name ?? "";
  if (!holder.data) return null;
  return buildHolderView({
    holderName: holder.data.name,
    year,
    stops,
    visits: (visits.data ?? []).map((v) => ({ memberId: v.member_id, visitDay: v.visit_day, redeemedYear: v.redeemed_year })),
    milestones: (milestones.data ?? []).map((m) => ({ id: m.id, stopsRequired: m.stops_required, rewardText: m.reward_text })),
    rewards: (rewards.data ?? []).map((r) => ({ milestoneId: r.milestone_id, year: r.year, handedOutAt: r.handed_out_at })),
    cards: (cards.data ?? []).map((c) => c.code),
    allVisits: (allVisits.data ?? []).map((v) => ({ memberId: v.member_id, memberName: nameOf(v.members), visitDay: v.visit_day })),
    waiting: (waiting.data ?? []).map((w) => ({ memberName: nameOf(w.members), reward: w.reward, terms: w.terms, expiresAt: w.expires_at })),
    canJoinTrail: joinable,
    hasTrailPass: trailPass,
  });
});

/** "Lost your card? Add a new one": links an unused card to the signed-in holder. */
export const addReplacementCard = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<{ kind: "added" } | { kind: "unknown-card" } | { kind: "already-active" } | { kind: "signed-out" }> => {
    const holderId = await readHolderId();
    if (!holderId) return { kind: "signed-out" };
    const limited = await rateLimitMessage("tapcard-card");
    if (limited) return { kind: "unknown-card" };
    const code = normalizeCardCode(data.code);
    if (!code) return { kind: "unknown-card" };
    const service = await getSupabaseServiceRoleClient();
    const { data: card, error } = await service.from("tap_cards").select("id, holder_id").eq("code", code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!card) return { kind: "unknown-card" };
    if (card.holder_id) return { kind: "already-active" };
    const { data: updated, error: updateError } = await service
      .from("tap_cards")
      .update({ holder_id: holderId, activated_at: new Date().toISOString() })
      .eq("id", card.id)
      .is("holder_id", null)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    return updated && updated.length > 0 ? { kind: "added" } : { kind: "already-active" };
  });

export const signOutHolder = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: true }> => {
  await endHolderSession();
  return { ok: true };
});

/** "Turn off this card": a lost card stops working at every stop. */
export const turnOffCard = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<{ kind: "turned-off" } | { kind: "not-yours" } | { kind: "signed-out" }> => {
    const holderId = await readHolderId();
    if (!holderId) return { kind: "signed-out" };
    const service = await getSupabaseServiceRoleClient();
    return deactivateCardCore(
      {
        async findCard(code) {
          const { data: card, error } = await service.from("tap_cards").select("id, holder_id, deactivated_at").eq("code", code).maybeSingle();
          if (error) throw new Error(error.message);
          return card ? { id: card.id, holderId: card.holder_id, deactivated: card.deactivated_at !== null } : null;
        },
        async deactivate(cardId) {
          const { error } = await service.from("tap_cards").update({ deactivated_at: new Date().toISOString() }).eq("id", cardId);
          if (error) throw new Error(error.message);
        },
      },
      holderId,
      data.code,
    );
  });
