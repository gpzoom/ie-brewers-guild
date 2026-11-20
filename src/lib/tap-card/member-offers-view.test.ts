import { describe, expect, it } from "vitest";
import type { TapCardMemberOfferRow } from "@/lib/supabase/types";
import { checkDraftForApproval, otherStepNumbers, sameDraft, slotViews } from "@/lib/tap-card/member-offers-view";

function row(o: Partial<TapCardMemberOfferRow>): TapCardMemberOfferRow {
  return {
    id: "o1",
    member_id: "m1",
    slot: "step1",
    live_visit_number: null,
    live_reward: null,
    live_terms: null,
    live_approved_at: null,
    live_approved_by: null,
    draft_visit_number: null,
    draft_reward: null,
    draft_terms: null,
    draft_status: null,
    draft_submitted_at: null,
    draft_submitted_by: null,
    decline_note: null,
    created_at: "2026-11-18T00:00:00Z",
    ...o,
  };
}

describe("slotViews", () => {
  it("always gives the four slots in order", () => {
    expect(slotViews([])).toEqual([
      { slot: "step1", id: null, live: null, draft: null },
      { slot: "step2", id: null, live: null, draft: null },
      { slot: "step3", id: null, live: null, draft: null },
      { slot: "repeat", id: null, live: null, draft: null },
    ]);
  });

  it("maps a live version with a change waiting", () => {
    const views = slotViews([
      row({
        slot: "step2",
        live_visit_number: 5,
        live_reward: "Glass",
        live_terms: "",
        draft_visit_number: 6,
        draft_reward: "Big glass",
        draft_terms: "One each",
        draft_status: "pending",
      }),
    ]);
    expect(views[1]).toEqual({
      slot: "step2",
      id: "o1",
      live: { visitNumber: 5, reward: "Glass", terms: "" },
      draft: { visitNumber: 6, reward: "Big glass", terms: "One each", status: "pending", note: null },
    });
  });

  it("carries the Guild's note on a declined change", () => {
    const views = slotViews([
      row({ slot: "repeat", draft_visit_number: 4, draft_reward: "Free pint", draft_terms: "", draft_status: "declined", decline_note: "No free alcohol" }),
    ]);
    expect(views[3].draft).toEqual({ visitNumber: 4, reward: "Free pint", terms: "", status: "declined", note: "No free alcohol" });
    expect(views[3].live).toBeNull();
  });
});

describe("otherStepNumbers", () => {
  const views = slotViews([
    row({ id: "a", slot: "step1", live_visit_number: 3, live_reward: "Pretzel", live_terms: "" }),
    row({ id: "c", slot: "step3", draft_visit_number: 5, draft_reward: "Glass", draft_terms: "", draft_status: "pending" }),
    row({ id: "r", slot: "repeat", live_visit_number: 4, live_reward: "$2 off", live_terms: "" }),
  ]);

  it("counts live and waiting numbers of the other steps", () => {
    expect(otherStepNumbers(views, "step2", "live-and-draft")).toEqual([3, 5]);
  });
  it("counts only live numbers when approving", () => {
    expect(otherStepNumbers(views, "step2", "live")).toEqual([3]);
  });
  it("never counts the slot itself or the repeating reward", () => {
    expect(otherStepNumbers(views, "step1", "live-and-draft")).toEqual([5]);
  });
  it("ignores declined changes", () => {
    const declined = slotViews([row({ slot: "step1", draft_visit_number: 7, draft_reward: "X y z", draft_terms: "", draft_status: "declined" })]);
    expect(otherStepNumbers(declined, "step2", "live-and-draft")).toEqual([]);
  });
});

describe("sameDraft", () => {
  const waiting = row({
    draft_visit_number: 4,
    draft_reward: "Free pretzel",
    draft_terms: "Food only",
    draft_status: "pending",
    draft_submitted_at: "2026-11-18T10:00:00+00:00",
  });
  const seen = { visitNumber: 4, reward: "Free pretzel", terms: "Food only", submittedAt: "2026-11-18T10:00:00+00:00" };

  it("matches the change the admin is looking at", () => {
    expect(sameDraft(waiting, seen)).toBe(true);
  });
  it("refuses when the brewery sent something else since", () => {
    expect(sameDraft({ ...waiting, draft_reward: "Free pint" }, seen)).toBe(false);
    expect(sameDraft({ ...waiting, draft_visit_number: 5 }, seen)).toBe(false);
    expect(sameDraft({ ...waiting, draft_terms: "" }, seen)).toBe(false);
    expect(sameDraft({ ...waiting, draft_submitted_at: "2026-11-18T11:00:00+00:00" }, seen)).toBe(false);
  });
  it("refuses when nothing is waiting", () => {
    expect(sameDraft({ ...waiting, draft_status: "declined" }, seen)).toBe(false);
  });
});

describe("checkDraftForApproval", () => {
  const draft = { slot: "step1" as const, draft_visit_number: 1, draft_reward: "10% off", draft_terms: null };
  it("approves a visit-1 welcome reward for a member that isn't a trail stop", () => {
    expect(checkDraftForApproval(draft, [], { trailStop: false })).toEqual({
      ok: true,
      value: { slot: "step1", visitNumber: 1, reward: "10% off", terms: "" },
    });
  });
  it("refuses it once the member is a trail stop", () => {
    expect(checkDraftForApproval(draft, [], { trailStop: true }).ok).toBe(false);
  });
});
