import { describe, expect, it } from "vitest";
import {
  citiesToCheck,
  findDuplicate,
  isAlreadyMemberForPreview,
  normalizeBusinessName,
  type RosterCandidate,
} from "./duplicate-check";

const row = (o: Partial<RosterCandidate>): RosterCandidate => ({
  id: "m1",
  business_name: "Mars Brewing Company",
  city: "Riverside",
  status: "published",
  google_place_id: null,
  applied_via_join_at: null,
  ...o,
});
const base = { businessName: "Mars Brewing Co.", city: "riverside", placeId: null, ownerEmailMatches: () => false };

describe("normalizeBusinessName", () => {
  it("treats Co. and Company as the same", () => {
    expect(normalizeBusinessName("Mars Brewing Co.")).toBe(normalizeBusinessName("mars brewing company"));
  });
  it("strips punctuation, legal suffixes, The prefix and extra spaces", () => {
    expect(normalizeBusinessName("  The   Mars  Brewing, L.L.C. ")).toBe("mars brewing");
    expect(normalizeBusinessName("Mars Brewing Inc")).toBe("mars brewing");
    expect(normalizeBusinessName("Mars Brewing LLC")).toBe("mars brewing");
  });
});

describe("findDuplicate", () => {
  it("returns none for an empty roster", () => {
    expect(findDuplicate(base, [])).toEqual({ kind: "none" });
  });
  it("matches on name and city case-insensitively", () => {
    expect(findDuplicate(base, [row({})])).toEqual({ kind: "existing", memberId: "m1" });
  });
  it("does not match a different city", () => {
    expect(findDuplicate(base, [row({ city: "Corona" })])).toEqual({ kind: "none" });
  });
  it("place id wins regardless of name and city", () => {
    const r = row({ business_name: "Totally Different", city: "Elsewhere", google_place_id: "p1" });
    expect(findDuplicate({ ...base, placeId: "p1" }, [r])).toEqual({ kind: "existing", memberId: "m1" });
  });
  it("never matches declined entries", () => {
    expect(findDuplicate({ ...base, placeId: "p1" }, [row({ status: "declined", google_place_id: "p1" })])).toEqual({ kind: "none" });
  });
  it("own-application when applied via join and owner email matches", () => {
    const r = row({ status: "applied", applied_via_join_at: "2026-11-15T00:00:00Z" });
    expect(findDuplicate({ ...base, ownerEmailMatches: (id) => id === "m1" }, [r])).toEqual({ kind: "own-application", memberId: "m1" });
  });
  it("existing when applied via join but email does not match", () => {
    const r = row({ status: "applied", applied_via_join_at: "2026-11-15T00:00:00Z" });
    expect(findDuplicate(base, [r])).toEqual({ kind: "existing", memberId: "m1" });
  });
  it("existing when email matches but not an applied join entry", () => {
    expect(findDuplicate({ ...base, ownerEmailMatches: () => true }, [row({})])).toEqual({ kind: "existing", memberId: "m1" });
  });
  it("also matches by name in Google's city when it differs from the typed one", () => {
    const r = row({ city: "Corona" });
    expect(findDuplicate({ ...base, googleCity: "corona" }, [r])).toEqual({ kind: "existing", memberId: "m1" });
    expect(findDuplicate({ ...base, googleCity: null }, [r])).toEqual({ kind: "none" });
  });
  it("still matches the typed city when Google's city differs", () => {
    expect(findDuplicate({ ...base, googleCity: "Corona" }, [row({})])).toEqual({ kind: "existing", memberId: "m1" });
  });
});

describe("citiesToCheck", () => {
  it("keeps the typed city and adds Google's when different", () => {
    expect(citiesToCheck(" Riverside ", "Corona")).toEqual(["Riverside", "Corona"]);
  });
  it("drops a same-city (any case) or blank Google city", () => {
    expect(citiesToCheck("Riverside", "riverside")).toEqual(["Riverside"]);
    expect(citiesToCheck("Riverside", null)).toEqual(["Riverside"]);
    expect(citiesToCheck("Riverside", "  ")).toEqual(["Riverside"]);
  });
  it("drops a blank typed city", () => {
    expect(citiesToCheck("", "Corona")).toEqual(["Corona"]);
  });
});

describe("isAlreadyMemberForPreview", () => {
  const input = { businessName: "Mars Brewing Co.", city: "riverside", placeId: null };
  it("is true for a roster entry by name and city", () => {
    expect(isAlreadyMemberForPreview(input, [row({ status: "draft" })])).toBe(true);
  });
  it("is true by place id", () => {
    const r = row({ business_name: "Other", city: "Elsewhere", google_place_id: "p1" });
    expect(isAlreadyMemberForPreview({ ...input, placeId: "p1" }, [r])).toBe(true);
  });
  it("checks Google's city too", () => {
    expect(isAlreadyMemberForPreview({ ...input, googleCity: "Corona" }, [row({ city: "Corona" })])).toBe(true);
  });
  it("leaves a pending Join application to the submit (which knows the email)", () => {
    const r = row({ status: "applied", applied_via_join_at: "2026-11-15T00:00:00Z" });
    expect(isAlreadyMemberForPreview(input, [r])).toBe(false);
  });
  it("still counts an applied entry that didn't come through Join", () => {
    expect(isAlreadyMemberForPreview(input, [row({ status: "applied" })])).toBe(true);
  });
  it("ignores declined entries", () => {
    expect(isAlreadyMemberForPreview(input, [row({ status: "declined" })])).toBe(false);
  });
});
