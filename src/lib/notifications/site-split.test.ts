import { describe, expect, it } from "vitest";
import type { MemberNotificationRow } from "@/lib/supabase/types";
import type { ProblemOpen } from "./closed-day";
import { forSite, isSampleName } from "./site-split";

const NAMES: Record<string, string> = {
  s1: "Sample Brewery",
  s2: "Sample Food Truck",
  real: "Mars Brewing Co.",
};
const isSample = (id: string) => isSampleName(NAMES[id] ?? "");

function open(member_id: string, other: string | null): ProblemOpen {
  return {
    type: "closed_day_conflict",
    member_id,
    dedupe_key: `closed_day_conflict:${member_id}:e1:2026-11-26`,
    event_id: "e1",
    due_date: "2026-11-26",
    details: {
      role: other ? "host" : "own",
      event_id: "e1",
      other_member_id: other,
      closed_date: "2026-11-26",
      closed_note: null,
    },
    kind: "problem",
    recipient_roles: ["owner"],
    email_mode: "batched",
    reminder_days: 3,
  };
}

function row(id: string, member_id: string, other: string | null): MemberNotificationRow {
  return {
    id,
    type: "closed_day_conflict",
    kind: "problem",
    member_id,
    dedupe_key: null,
    details: { other_member_id: other },
    event_id: "e1",
    due_date: "2026-11-26",
    recipient_roles: ["owner"],
    email_mode: "batched",
    reminder_days: 3,
    status: "open",
    quiet: false,
    created_at: "2026-11-10T00:00:00Z",
    resolved_at: null,
    read_at: null,
    notice_sent_at: null,
    reminder_sent_at: null,
    claimed_at: null,
    attempts: 0,
    last_error: null,
  };
}

describe("isSampleName", () => {
  it("matches names starting with 'Sample '", () => {
    expect(isSampleName("Sample Brewery")).toBe(true);
    expect(isSampleName("Sampler Taproom")).toBe(false);
    expect(isSampleName("The Sample Brewery")).toBe(false);
  });
});

describe("forSite", () => {
  const sampleOnly = open("s1", "s2");
  const sampleOwn = open("s1", null);
  const mixed = open("real", "s1");
  const realOwn = open("real", null);
  const opens = [sampleOnly, sampleOwn, mixed, realOwn];

  it("staging keeps Sample-only rows and drops Sample-plus-real", () => {
    expect(forSite({ opens, resolveRows: [] }, isSample, true).opens).toEqual([
      sampleOnly,
      sampleOwn,
    ]);
  });

  it("live keeps real-only rows and drops Sample-only and Sample-plus-real", () => {
    expect(forSite({ opens, resolveRows: [] }, isSample, false).opens).toEqual([realOwn]);
  });

  it("a Sample-plus-real open is never opened, on either site", () => {
    const mixedOther = open("s1", "real");
    for (const staging of [true, false]) {
      expect(
        forSite({ opens: [mixed, mixedOther], resolveRows: [] }, isSample, staging).opens,
      ).toEqual([]);
    }
  });

  it("an all-Sample open is kept on staging; an all-real open is kept on live", () => {
    expect(forSite({ opens: [sampleOnly], resolveRows: [] }, isSample, true).opens).toEqual([
      sampleOnly,
    ]);
    const realPair = open("real", "real2");
    const isSampleWithReal2 = (id: string) => (id === "real2" ? false : isSample(id));
    expect(
      forSite({ opens: [realPair, realOwn], resolveRows: [] }, isSampleWithReal2, false).opens,
    ).toEqual([realPair, realOwn]);
  });

  it("live still resolves a pre-existing Sample-plus-real row", () => {
    const resolveRows = [row("m", "real", "s1")];
    expect(forSite({ opens: [], resolveRows }, isSample, false).resolveIds).toEqual(["m"]);
    expect(forSite({ opens: [], resolveRows }, isSample, true).resolveIds).toEqual([]);
  });

  it("splits resolves the same way", () => {
    const resolveRows = [
      row("a", "s1", "s2"),
      row("b", "s1", null),
      row("c", "s2", "real"),
      row("d", "real", null),
    ];
    expect(forSite({ opens: [], resolveRows }, isSample, true).resolveIds).toEqual(["a", "b"]);
    expect(forSite({ opens: [], resolveRows }, isSample, false).resolveIds).toEqual(["c", "d"]);
  });
});
