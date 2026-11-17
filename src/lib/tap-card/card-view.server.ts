import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { rateLimitMessage } from "@/lib/join/join-guards.server";
import { normalizeCardCode } from "@/lib/tap-card/card-code";
import { firstNameOf, guessGuard, pickCardViewKind, type CardView } from "@/lib/tap-card/card-view";
import { checkInCore, redemptionStatus, type CheckInOutcome } from "@/lib/tap-card/check-in-core";
import { tapCardDay, tapCardYear } from "@/lib/tap-card/tap-card-time";
import { readHolderId, readScannerDevice, setScannerCookie } from "@/lib/tap-card/tap-card-cookies.server";
import { awardMilestones, checkInStore } from "@/lib/tap-card/tap-card-store.server";
import { offerForMember } from "@/lib/tap-card/offers-db.server";

/**
 * /p/<code>, /scanner/<token>: the card page and the bar device's setup.
 * Every handler re-reads the cookies itself; nothing from the page is trusted.
 */

async function loadCard(code: string) {
  const service = await getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("tap_cards")
    .select("id, code, holder_id, deactivated_at, tap_card_holders(name)")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deactivated_at) return { service, card: null };
  const holder = data.tap_card_holders as unknown as { name: string } | null;
  return { service, card: { id: data.id, code: data.code, holderId: data.holder_id as string | null, holderName: holder?.name ?? "" } };
}

export const getCardView = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<CardView> => {
    const device = await readScannerDevice();
    const code = normalizeCardCode(data.code);
    const { service, card } = code ? await loadCard(code) : { service: null, card: null };
    // Only unknown codes count against the per-IP limit (guessGuard), so real
    // cardholders on shared Wi-Fi are never turned away.
    let limitedMessage: string | null = null;
    const guard = await guessGuard(device.kind, card !== null, async () => {
      limitedMessage = await rateLimitMessage("tapcard-card");
      return limitedMessage !== null;
    });
    if (guard === "throttled") return { view: "throttled", message: limitedMessage ?? "Too many tries — please wait a minute and try again." };
    if (!code || !service) return { view: "unknown" };
    const kind = pickCardViewKind(device, card, device.kind === "none" ? await readHolderId() : null);

    switch (kind) {
      case "unknown":
        return { view: "unknown" };
      case "staff-blocked":
        return { view: "staff-blocked", memberName: device.kind === "blocked" ? device.device.memberName : "" };
      case "staff-activate":
        return { view: "staff-activate", code, memberName: device.kind === "ok" ? device.device.memberName : "" };
      case "staff-check-in": {
        if (device.kind !== "ok" || !card?.holderId) return { view: "unknown" };
        const now = new Date();
        const store = checkInStore(service);
        const [redemption, today, offer] = await Promise.all([
          redemptionStatus(store, card.holderId, device.device.memberId, now),
          store.findVisit(card.holderId, device.device.memberId, tapCardDay(now)),
          offerForMember(service, device.device.memberId),
        ]);
        return {
          view: "staff-check-in",
          code,
          memberName: device.device.memberName,
          firstName: firstNameOf(card.holderName),
          offer,
          redemption,
          visitedToday: today !== null,
        };
      }
      case "customer-activate":
        return { view: "customer-activate", code };
      case "customer-active":
        return { view: "customer-active" };
      case "customer-own":
        return { view: "customer-own" };
    }
  });

export type RecordCheckInResult =
  | (CheckInOutcome & { rewards: string[] })
  | { kind: "not-allowed" }
  | { kind: "unknown-card" };

export const recordCheckIn = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; redeem: boolean }) => ({ code: String(data?.code ?? ""), redeem: data?.redeem === true }))
  .handler(async ({ data }): Promise<RecordCheckInResult> => {
    const device = await readScannerDevice();
    if (device.kind !== "ok") return { kind: "not-allowed" };
    const code = normalizeCardCode(data.code);
    const { service, card } = code ? await loadCard(code) : { service: null, card: null };
    if (!service || !card?.holderId) return { kind: "unknown-card" };
    const at = new Date();
    const outcome = await checkInCore(checkInStore(service), {
      holderId: card.holderId,
      memberId: device.device.memberId,
      cardId: card.id,
      deviceId: device.device.id,
      redeem: data.redeem,
      at,
    });
    const visitAdded = outcome.kind === "recorded" || (outcome.kind === "already-redeemed" && outcome.visitRecorded);
    const rewards = visitAdded ? (await awardMilestones(service, card.holderId, tapCardYear(at))).map((m) => m.rewardText) : [];
    return { ...outcome, rewards };
  });

/** The bar device's one-time setup link: remembers this browser as that brewery's device. */
export const claimScannerLink = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }): Promise<{ ok: boolean; memberName?: string }> => {
    if (!data.token || data.token.length > 100) return { ok: false };
    const service = await getSupabaseServiceRoleClient();
    const { data: device, error } = await service
      .from("scanner_devices")
      .select("id, revoked_at, members!inner(business_name)")
      .eq("token_hash", await hashUploadToken(data.token))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!device || device.revoked_at) return { ok: false };
    setScannerCookie(data.token);
    await service.from("scanner_devices").update({ last_used_at: new Date().toISOString() }).eq("id", device.id);
    return { ok: true, memberName: (device.members as unknown as { business_name: string }).business_name };
  });

/** /scanner: is this browser a bar device, and for which brewery? */
export const getScannerStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ kind: "none" } | { kind: "blocked" | "ok"; memberName: string; label: string }> => {
    const device = await readScannerDevice();
    if (device.kind === "none") return { kind: "none" };
    return { kind: device.kind, memberName: device.device.memberName, label: device.device.label };
  },
);
