import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import { sendTransactionalEmail } from "@/lib/email/send";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { isHoneypotTripped } from "@/lib/contact/contact-form-validation";
import { SOMETHING_WRONG, rateLimitMessage } from "@/lib/join/join-guards.server";
import { normalizeCardCode } from "@/lib/tap-card/card-code";
import { buildHolderView, type HolderCardView } from "@/lib/tap-card/holder-view";
import { tapCardYear } from "@/lib/tap-card/tap-card-time";
import { loadTrailStops } from "@/lib/tap-card/trail-stops.server";
import {
  LOGIN_TOKEN_TTL_MINUTES,
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
  .inputValidator((data: { email: string; website: string }) => ({
    email: String(data?.email ?? "").trim().toLowerCase(),
    website: String(data?.website ?? ""),
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
      if (holder) {
        const raw = generateUploadToken();
        const { error: insertError } = await service.from("tap_card_login_tokens").insert({
          holder_id: holder.id,
          token_hash: await hashUploadToken(raw),
          expires_at: new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
        });
        if (insertError) throw new Error(insertError.message);
        const link = `${resolveEmailSiteUrl(currentRequestUrl())}/card/login/${raw}`;
        await sendTransactionalEmail({ trigger: "tap_card_signin_link", email: data.email, link });
      }
      return { kind: "check-email" };
    } catch (err) {
      console.error("requestHolderSignIn failed", err instanceof Error ? err.message : String(err));
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
  const [holder, stops, visits, milestones, rewards, cards] = await Promise.all([
    service.from("tap_card_holders").select("name").eq("id", holderId).maybeSingle(),
    loadTrailStops(service),
    service.from("tap_card_visits").select("member_id, visit_day, redeemed_year").eq("holder_id", holderId).gte("visit_day", `${year}-01-01`),
    service.from("tap_card_milestones").select("id, stops_required, reward_text").eq("active", true),
    service.from("tap_card_rewards").select("milestone_id, year, handed_out_at").eq("holder_id", holderId).eq("year", year),
    service.from("tap_cards").select("code").eq("holder_id", holderId).is("deactivated_at", null).order("activated_at"),
  ]);
  for (const r of [holder, visits, milestones, rewards, cards]) if (r.error) throw new Error(r.error.message);
  if (!holder.data) return null;
  return buildHolderView({
    holderName: holder.data.name,
    year,
    stops,
    visits: (visits.data ?? []).map((v) => ({ memberId: v.member_id, visitDay: v.visit_day, redeemedYear: v.redeemed_year })),
    milestones: (milestones.data ?? []).map((m) => ({ id: m.id, stopsRequired: m.stops_required, rewardText: m.reward_text })),
    rewards: (rewards.data ?? []).map((r) => ({ milestoneId: r.milestone_id, year: r.year, handedOutAt: r.handed_out_at })),
    cards: (cards.data ?? []).map((c) => c.code),
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
