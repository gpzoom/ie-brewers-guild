import { validateMemberOffer } from "@/lib/tap-card/loyalty";
import type { TapCardMemberOfferRow } from "@/lib/supabase/types";
import type { OfferSlot } from "@/lib/tap-card/loyalty";

/**
 * A brewery's four reward slots (Step 1-3 and the repeating reward) as the
 * Offers screen shows them: the approved version customers see, and any
 * change waiting for the Guild (or turned down, with the Guild's note).
 */
export type OfferVersion = { visitNumber: number; reward: string; terms: string };
export type SlotView = {
  slot: OfferSlot;
  id: string | null;
  live: OfferVersion | null;
  draft: (OfferVersion & { status: "pending" | "declined"; note: string | null }) | null;
};

export const SLOT_ORDER: readonly OfferSlot[] = ["step1", "step2", "step3", "repeat"];

export function slotViews(rows: TapCardMemberOfferRow[]): SlotView[] {
  return SLOT_ORDER.map((slot) => {
    const r = rows.find((x) => x.slot === slot);
    if (!r) return { slot, id: null, live: null, draft: null };
    return {
      slot,
      id: r.id,
      live:
        r.live_reward !== null && r.live_visit_number !== null
          ? { visitNumber: r.live_visit_number, reward: r.live_reward, terms: r.live_terms ?? "" }
          : null,
      draft:
        r.draft_reward !== null && r.draft_visit_number !== null && r.draft_status !== null
          ? { visitNumber: r.draft_visit_number, reward: r.draft_reward, terms: r.draft_terms ?? "", status: r.draft_status, note: r.decline_note }
          : null,
    };
  });
}

/**
 * Visit numbers the brewery's OTHER steps use, so two steps can't share one.
 * "live-and-draft" when a member submits (live versions plus changes still
 * waiting); "live" when the Guild approves. Declined changes never block.
 */
export function otherStepNumbers(views: SlotView[], slot: OfferSlot, use: "live-and-draft" | "live"): number[] {
  const numbers: number[] = [];
  for (const v of views) {
    if (v.slot === slot || v.slot === "repeat") continue;
    if (v.live) numbers.push(v.live.visitNumber);
    if (use === "live-and-draft" && v.draft?.status === "pending") numbers.push(v.draft.visitNumber);
  }
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/** The waiting change exactly as a Guild admin saw it on the approvals screen. */
export type SeenDraft = { visitNumber: number; reward: string; terms: string; submittedAt: string };

/**
 * Approve/decline only what the admin actually looked at: if the brewery sent
 * a different change since, refuse (final review, Important 2).
 */
export function sameDraft(row: TapCardMemberOfferRow, seen: SeenDraft): boolean {
  return (
    row.draft_status === "pending" &&
    row.draft_visit_number === seen.visitNumber &&
    row.draft_reward === seen.reward &&
    (row.draft_terms ?? "") === seen.terms &&
    row.draft_submitted_at !== null &&
    new Date(row.draft_submitted_at).getTime() === new Date(seen.submittedAt).getTime()
  );
}

/** The Guild approving a waiting change: the same rules as saving, for this member's kind (trail stop or not). */
export function checkDraftForApproval(
  row: { slot: OfferSlot; draft_visit_number: number | null; draft_reward: string | null; draft_terms: string | null },
  otherNumbers: number[],
  opts: { trailStop: boolean },
) {
  return validateMemberOffer(
    { slot: row.slot, visitNumber: row.draft_visit_number ?? NaN, reward: row.draft_reward ?? "", terms: row.draft_terms ?? "" },
    otherNumbers,
    opts,
  );
}
