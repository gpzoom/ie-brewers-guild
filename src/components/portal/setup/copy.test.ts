import { describe, expect, it } from "vitest";
import { welcomeHandyItems } from "./IntroSteps";
import { eventsLede } from "./SectionSteps";

describe("Welcome copy (redesign)", () => {
  it("the logo item points to step 4's PNG help and photos accept JPG or PNG", () => {
    const items = welcomeHandyItems("producer");
    expect(items[0].body).toContain("No PNG? You can get one made for free; step 4 shows you how.");
    expect(items[1].body.startsWith("JPG or PNG.")).toBe(true);
  });

  it("Allied Members also see the member discount item", () => {
    expect(welcomeHandyItems("allied").map((i) => i.title)).toContain("Your member discount");
  });

  it("mobile members see 'Where you'll be' instead of hours", () => {
    expect(welcomeHandyItems("mobile").map((i) => i.title)).toContain("Where you'll be");
  });
});

describe("Events lede (redesign)", () => {
  it("speaks to taprooms and to Allied Members separately", () => {
    expect(eventsLede("producer")).toMatch(/^Trivia nights, releases, open houses\./);
    expect(eventsLede("allied")).toMatch(/^Tastings, open houses, workshops\./);
  });
});
