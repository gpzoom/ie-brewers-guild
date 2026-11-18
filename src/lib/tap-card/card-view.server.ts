import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import { claimScannerCore, type ClaimStore } from "@/lib/tap-card/claim-scanner";
import { rateLimitMessage } from "@/lib/join/join-guards.server";
import { normalizeCardCode } from "@/lib/tap-card/card-code";
import { firstNameOf, guessGuard, pickCardViewKind, type CardView } from "@/lib/tap-card/card-view";
import { checkInVisit, undoBarReward, useBarReward, type BarState, type RewardChoice } from "@/lib/tap-card/bar-core";
import { barStore } from "@/lib/tap-card/bar-store.server";
import { tapCardYear } from "@/lib/tap-card/tap-card-time";
import { readHolderId, readScannerDevice, setScannerCookie } from "@/lib/tap-card/tap-card-cookies.server";
import { awardMilestones } from "@/lib/tap-card/tap-card-store.server";

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
      case "staff-check-in":
        // Read-only: the check-in screen records the visit with a POST once it opens.
        if (device.kind !== "ok" || !card?.holderId) return { view: "unknown" };
        return { view: "staff-check-in", code, memberName: device.device.memberName, firstName: firstNameOf(card.holderName) };
      case "customer-activate":
        return { view: "customer-activate", code };
      case "customer-active":
        return { view: "customer-active" };
      case "customer-own":
        return { view: "customer-own" };
    }
  });

export type BarResult =
  | { kind: "ok"; state: BarState; milestoneRewards: string[]; outcome?: "used" | "already-used-today" | "not-available" | "undone" | "nothing-to-undo" }
  | { kind: "not-allowed" }
  | { kind: "unknown-card" };

/** Bar device + card for the bar POSTs; null result means refuse with that BarResult. */
async function barContext(rawCode: string) {
  const device = await readScannerDevice();
  if (device.kind !== "ok") return { refuse: { kind: "not-allowed" } as BarResult };
  const code = normalizeCardCode(rawCode);
  const { service, card } = code ? await loadCard(code) : { service: null, card: null };
  if (!service || !card?.holderId) return { refuse: { kind: "unknown-card" } as BarResult };
  return {
    service,
    input: { holderId: card.holderId, memberId: device.device.memberId, cardId: card.id, deviceId: device.device.id, at: new Date() },
  };
}

/** The check-in screen opened: record today's visit (once) and say what's waiting. */
export const checkInCard = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<BarResult> => {
    const ctx = await barContext(data.code);
    if ("refuse" in ctx) return ctx.refuse!;
    const state = await checkInVisit(barStore(ctx.service), ctx.input);
    const milestoneRewards = state.firstToday
      ? (await awardMilestones(ctx.service, ctx.input.holderId, tapCardYear(ctx.input.at))).map((m) => m.rewardText)
      : [];
    return { kind: "ok", state, milestoneRewards };
  });

export const useCardReward = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; choice: RewardChoice }) => ({
    code: String(data?.code ?? ""),
    choice: (data?.choice?.kind === "member" ? { kind: "member", id: String(data.choice.id ?? "") } : { kind: "trail" }) as RewardChoice,
  }))
  .handler(async ({ data }): Promise<BarResult> => {
    const ctx = await barContext(data.code);
    if ("refuse" in ctx) return ctx.refuse!;
    const { outcome, state } = await useBarReward(barStore(ctx.service), { ...ctx.input, choice: data.choice });
    return { kind: "ok", state, milestoneRewards: [], outcome };
  });

export const undoCardReward = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<BarResult> => {
    const ctx = await barContext(data.code);
    if ("refuse" in ctx) return ctx.refuse!;
    const { outcome, state } = await undoBarReward(barStore(ctx.service), ctx.input);
    return { kind: "ok", state, milestoneRewards: [], outcome };
  });

/** The bar device's one-time setup link: remembers this browser as that brewery's device. */
async function scannerClaimStore(): Promise<ClaimStore> {
  const service = await getSupabaseServiceRoleClient();
  return {
    async byHash(hash) {
      const { data, error } = await service
        .from("scanner_devices")
        .select("id, revoked_at, members!inner(business_name)")
        .eq("token_hash", hash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        revokedAt: data.revoked_at,
        memberName: (data.members as unknown as { business_name: string }).business_name,
      };
    },
    async swapHash(id, oldHash, newHash) {
      const { data, error } = await service
        .from("scanner_devices")
        .update({ token_hash: newHash, last_used_at: new Date().toISOString() })
        .eq("id", id)
        .eq("token_hash", oldHash)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },
  };
}

/**
 * /scanner/<token> on page load: is this setup link still good? Only looks --
 * opening the link (or a message app previewing it) never uses it up.
 */
export const checkScannerLink = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }): Promise<{ ok: false } | { ok: true; memberName: string }> => {
    if (!data.token || data.token.length > 100) return { ok: false };
    const device = await (await scannerClaimStore()).byHash(await hashUploadToken(data.token));
    if (!device || device.revokedAt) return { ok: false };
    return { ok: true, memberName: device.memberName };
  });

/** The "Set up this device" button: uses the link up and remembers this browser as a bar device. */
export const claimScannerLink = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const result = await claimScannerCore(await scannerClaimStore(), data.token, generateUploadToken());
    if (!result.ok) return { ok: false };
    setScannerCookie(result.deviceKey);
    return { ok: true };
  });

/** /scanner: is this browser a bar device, and for which brewery? */
export const getScannerStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ kind: "none" } | { kind: "blocked" | "ok"; memberName: string; label: string }> => {
    const device = await readScannerDevice();
    if (device.kind === "none") return { kind: "none" };
    return { kind: device.kind, memberName: device.device.memberName, label: device.device.label };
  },
);
