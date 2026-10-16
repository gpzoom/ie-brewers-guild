import { describe, expect, it } from "vitest";
import { groupRoster, matchesRosterSearch, type RosterBusiness } from "./roster-groups";
import type { RosterEntry } from "./roster.server";

function entry(id: string, name: string, city: string, businessId: string | null): RosterEntry {
  return {
    member: { id, business_name: name, city, business_id: businessId } as RosterEntry["member"],
    claimState: "unclaimed",
    ownerEmail: null,
    ownerUserId: null,
  };
}

const hangar: RosterBusiness = { id: "b1", name: "Hangar 24 Brewing Co.", mode: "one_manager", hasManager: false, managerEmail: null, managerSignedIn: false, managerUserId: null };
const all = () => true;

describe("groupRoster", () => {
  const entries = [
    entry("m1", "Hangar 24 Brewing Co.", "Riverside", "b1"),
    entry("m2", "Alpha Brewing", "Chino", null),
    entry("m3", "Hangar 24 Brewing Co.", "Irvine", "b1"),
  ];

  it("one group per business, its locations by city, singles alongside, ordered by name", () => {
    const groups = groupRoster(entries, [hangar], all);
    expect(groups.map((g) => (g.kind === "single" ? g.entry.member.id : g.business.id))).toEqual(["m2", "b1"]);
    const business = groups[1];
    expect(business.kind === "business" && business.entries.map((e) => e.member.city)).toEqual(["Irvine", "Riverside"]);
  });

  it("a search that matches one location keeps the business row with just that location", () => {
    const groups = groupRoster(entries, [hangar], (e) => e.member.city === "Irvine");
    expect(groups).toHaveLength(1);
    expect(groups[0].kind === "business" && groups[0].entries.map((e) => e.member.id)).toEqual(["m3"]);
  });

  it("a filter that matches no location hides the business", () => {
    expect(groupRoster(entries, [hangar], (e) => e.member.id === "m2").map((g) => g.kind)).toEqual(["single"]);
  });

  it("a location whose business isn't in the list shows as a single", () => {
    expect(groupRoster([entry("m1", "X", "Y", "gone")], [], all)[0].kind).toBe("single");
  });
});

describe("matchesRosterSearch", () => {
  const names = new Map([["b1", "Hangar 24 Brewing Co."]]);

  it("matches the location's own name or city", () => {
    expect(matchesRosterSearch(entry("m1", "Alpha Brewing", "Chino", null), "alpha", names)).toBe(true);
    expect(matchesRosterSearch(entry("m1", "Alpha Brewing", "Chino", null), "chino", names)).toBe(true);
    expect(matchesRosterSearch(entry("m1", "Alpha Brewing", "Chino", null), "hangar", names)).toBe(false);
  });

  it("matches the name of the business the location is part of", () => {
    expect(matchesRosterSearch(entry("m1", "H24 Downtown", "Redlands", "b1"), "hangar", names)).toBe(true);
  });

  it("an empty search matches everything", () => {
    expect(matchesRosterSearch(entry("m1", "Alpha Brewing", "Chino", null), "", names)).toBe(true);
  });
});
