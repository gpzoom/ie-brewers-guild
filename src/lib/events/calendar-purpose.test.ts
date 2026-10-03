import { describe, expect, it } from "vitest";
import { canHaveFoodCalendar, canonicalTag, foodCalendarProblem, parseCalendarPurpose } from "./calendar-purpose";

describe("calendar purpose", () => {
  it("anything but 'food' is the events calendar", () => {
    expect(parseCalendarPurpose("food")).toBe("food");
    expect(parseCalendarPurpose("events")).toBe("events");
    expect(parseCalendarPurpose(undefined)).toBe("events");
    expect(parseCalendarPurpose("drinks")).toBe("events");
  });

  it("only producers get a food calendar", () => {
    expect(canHaveFoodCalendar("producer")).toBe(true);
    expect(canHaveFoodCalendar("mobile")).toBe(false);
    expect(canHaveFoodCalendar("allied")).toBe(false);
    expect(canHaveFoodCalendar(null)).toBe(false);
  });
});

describe("foodCalendarProblem", () => {
  it("refuses a non-producer", () => {
    expect(
      foodCalendarProblem({ memberType: "allied", syncTag: "#food", eventsTag: "#guild" }),
    ).toBe("The food calendar is only for Producers.");
  });

  it("refuses the events calendar's tag, with or without # and in any case", () => {
    for (const syncTag of ["#guild", "guild", " #GUILD "]) {
      expect(foodCalendarProblem({ memberType: "producer", syncTag, eventsTag: "#guild" })).toMatch(
        /different tag/,
      );
    }
  });

  it("accepts a producer's own tag, including when there's no events calendar", () => {
    expect(
      foodCalendarProblem({ memberType: "producer", syncTag: "#food", eventsTag: "#guild" }),
    ).toBeNull();
    expect(
      foodCalendarProblem({ memberType: "producer", syncTag: "#food", eventsTag: null }),
    ).toBeNull();
  });
});

describe("canonicalTag", () => {
  it("saves a tag with exactly one # in front", () => {
    expect(canonicalTag("food")).toBe("#food");
    expect(canonicalTag("  #food ")).toBe("#food");
    expect(canonicalTag("##Food")).toBe("#Food");
  });

  it("leaves a blank tag blank", () => {
    expect(canonicalTag("")).toBe("");
    expect(canonicalTag("  # ")).toBe("");
    expect(canonicalTag(null)).toBe("");
  });
});
