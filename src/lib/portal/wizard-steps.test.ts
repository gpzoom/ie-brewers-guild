import { describe, expect, it } from "vitest";
import {
  allStepsForType,
  canSkipStep,
  isSetupStepName,
  isStepForType,
  nextStep,
  numberedStepsForType,
  previousStep,
  resolveSetupAccess,
  stepLabel,
  stepPosition,
} from "./wizard-steps";

describe("numberedStepsForType", () => {
  it("a producer sees seven steps: no discount", () => {
    expect(numberedStepsForType("producer")).toEqual([
      "welcome",
      "basics",
      "logo-cover",
      "hours",
      "events",
      "links",
      "theme",
    ]);
  });

  it("a mobile member sees six: no separate events step, no discount", () => {
    expect(numberedStepsForType("mobile")).toEqual([
      "welcome",
      "basics",
      "logo-cover",
      "hours",
      "links",
      "theme",
    ]);
  });

  it("an Affiliate Member sees all eight", () => {
    expect(numberedStepsForType("allied")).toHaveLength(8);
    expect(numberedStepsForType("allied")).toContain("discount");
  });

  it("has no Confirm type step: Producer 7, Mobile 6, Affiliate 8, short setup 5", () => {
    expect(isSetupStepName("type")).toBe(false);
    expect(numberedStepsForType("producer")).toHaveLength(7);
    expect(numberedStepsForType("mobile")).toHaveLength(6);
    expect(numberedStepsForType("allied")).toHaveLength(8);
    expect(numberedStepsForType("producer", { shortSetup: true })).toHaveLength(5);
  });

  it("the finish screens follow the numbered steps", () => {
    expect(allStepsForType("producer").slice(-4)).toEqual(["review", "preview", "publish", "live"]);
  });
});

describe("stepPosition", () => {
  it("matches StepAnatomy: hours is step 4 of 7 for a producer", () => {
    expect(stepPosition("hours", "producer")).toEqual({ number: 4, total: 7 });
  });

  it("counts only the type's own steps", () => {
    expect(stepPosition("links", "mobile")).toEqual({ number: 5, total: 6 });
    expect(stepPosition("theme", "allied")).toEqual({ number: 8, total: 8 });
  });

  it("has no number for finish screens or steps the type doesn't see", () => {
    expect(stepPosition("review", "producer")).toBeNull();
    expect(stepPosition("discount", "producer")).toBeNull();
    expect(stepPosition("events", "mobile")).toBeNull();
  });
});

describe("nextStep / previousStep", () => {
  it("skips steps the type doesn't see", () => {
    expect(nextStep("hours", "mobile")).toBe("links");
    expect(nextStep("links", "producer")).toBe("theme");
    expect(nextStep("links", "allied")).toBe("discount");
    expect(previousStep("theme", "producer")).toBe("links");
    expect(previousStep("links", "mobile")).toBe("hours");
  });

  it("runs theme -> review -> preview -> publish -> live, then stops", () => {
    expect(nextStep("theme", "producer")).toBe("review");
    expect(nextStep("review", "producer")).toBe("preview");
    expect(nextStep("preview", "producer")).toBe("publish");
    expect(nextStep("publish", "producer")).toBe("live");
    expect(nextStep("live", "producer")).toBeNull();
  });

  it("has nothing before welcome", () => {
    expect(previousStep("welcome", "producer")).toBeNull();
  });
});

describe("labels and skipping", () => {
  it("calls step 4 'Where we'll be' for a mobile member", () => {
    expect(stepLabel("hours", "mobile")).toBe("Where we'll be");
    expect(stepLabel("hours", "producer")).toBe("When you're open");
  });

  it("offers Skip for now on every optional step, never on welcome or basics", () => {
    expect(canSkipStep("welcome")).toBe(false);
    expect(canSkipStep("basics")).toBe(false);
    expect(canSkipStep("hours")).toBe(true);
    expect(canSkipStep("theme")).toBe(true);
    expect(canSkipStep("review")).toBe(false);
  });

  it("recognizes step names", () => {
    expect(isSetupStepName("logo-cover")).toBe(true);
    expect(isSetupStepName("live")).toBe(true);
    expect(isSetupStepName("nope")).toBe(false);
    expect(isSetupStepName(3)).toBe(false);
  });
});

describe("resolveSetupAccess", () => {
  const base = { memberType: "producer" as const, role: "owner" as const };

  it("never lets a Photos & events editor into the wizard", () => {
    expect(
      resolveSetupAccess({
        ...base,
        role: "media_events",
        step: "welcome",
        typeConfirmed: false,
        setupCompleted: false,
      }),
    ).toEqual({ kind: "portal" });
  });

  describe("while setup is incomplete", () => {
    const fresh = { ...base, typeConfirmed: false, setupCompleted: false };
    const typed = { ...base, typeConfirmed: true, setupCompleted: false };

    it("opens welcome", () => {
      expect(resolveSetupAccess({ ...fresh, step: "welcome" })).toEqual({ kind: "ok" });
    });

    it("sends basics back to welcome until the type is confirmed (Get started confirms it)", () => {
      expect(resolveSetupAccess({ ...fresh, step: "basics" })).toEqual({
        kind: "step",
        step: "welcome",
      });
      expect(resolveSetupAccess({ ...typed, step: "basics" })).toEqual({ kind: "ok" });
    });

    it("redirects the retired Confirm type step: welcome if unconfirmed, else basics", () => {
      expect(resolveSetupAccess({ ...fresh, step: "type" })).toEqual({ kind: "step", step: "welcome" });
      expect(resolveSetupAccess({ ...typed, step: "type" })).toEqual({ kind: "step", step: "basics" });
    });

    it("sends later steps to the first incomplete of steps 1-2", () => {
      expect(resolveSetupAccess({ ...fresh, step: "links" })).toEqual({
        kind: "step",
        step: "welcome",
      });
      expect(resolveSetupAccess({ ...typed, step: "links" })).toEqual({
        kind: "step",
        step: "basics",
      });
      expect(resolveSetupAccess({ ...typed, step: "publish" })).toEqual({
        kind: "step",
        step: "basics",
      });
    });

    it("sends an unknown step to where /portal would start", () => {
      expect(resolveSetupAccess({ ...fresh, step: "bogus" })).toEqual({
        kind: "step",
        step: "welcome",
      });
      expect(resolveSetupAccess({ ...typed, step: "bogus" })).toEqual({
        kind: "step",
        step: "basics",
      });
    });
  });

  describe("once setup is complete", () => {
    const done = { ...base, typeConfirmed: true, setupCompleted: true };

    it("keeps every step open, so Back always works", () => {
      for (const step of [
        "welcome",
        "basics",
        "logo-cover",
        "hours",
        "events",
        "links",
        "theme",
        "review",
        "preview",
        "publish",
        "live",
      ]) {
        expect(resolveSetupAccess({ ...done, step })).toEqual({ kind: "ok" });
      }
    });

    it("sends the retired type step to basics", () => {
      expect(resolveSetupAccess({ ...done, step: "type" })).toEqual({ kind: "step", step: "basics" });
    });

    it("sends an unknown step to /portal", () => {
      expect(resolveSetupAccess({ ...done, step: "bogus" })).toEqual({ kind: "portal" });
    });
  });

  it("moves a type past steps it doesn't see", () => {
    const done = { typeConfirmed: true, setupCompleted: true, role: "owner" as const };
    expect(resolveSetupAccess({ ...done, memberType: "mobile", step: "events" })).toEqual({
      kind: "step",
      step: "links",
    });
    expect(resolveSetupAccess({ ...done, memberType: "producer", step: "discount" })).toEqual({
      kind: "step",
      step: "theme",
    });
    expect(resolveSetupAccess({ ...done, memberType: "allied", step: "discount" })).toEqual({
      kind: "ok",
    });
  });
});

describe("redesign (2026-10-02)", () => {
  it("labels step 3 and step 8 with their new names", () => {
    expect(stepLabel("logo-cover", "producer")).toBe("Logo, Photos & Cover");
    expect(stepLabel("theme", "producer")).toBe("Pick your theme");
  });

  it("a producer's step 3 is step 3 of 7", () => {
    expect(stepPosition("logo-cover", "producer")).toEqual({ number: 3, total: 7 });
  });

  it("the old photos step goes to Logo, Photos & Cover", () => {
    expect(
      resolveSetupAccess({ step: "photos", memberType: "producer", role: "owner", typeConfirmed: true, setupCompleted: true }),
    ).toEqual({ kind: "step", step: "logo-cover" });
  });

  it("a Photos & events editor still never sees the wizard", () => {
    expect(
      resolveSetupAccess({ step: "basics", memberType: "producer", role: "media_events", typeConfirmed: true, setupCompleted: true }),
    ).toEqual({ kind: "portal" });
  });
});

describe("short setup (a business's other locations, Part 4)", () => {
  const short = { shortSetup: true };

  it("a producer's numbered steps are basics, logo-cover, hours, events, links", () => {
    expect(numberedStepsForType("producer", short)).toEqual([
      "basics",
      "logo-cover",
      "hours",
      "events",
      "links",
    ]);
    expect(stepPosition("basics", "producer", short)).toEqual({ number: 1, total: 5 });
  });

  it("an Affiliate Member's include discount; a mobile member's skip events", () => {
    expect(numberedStepsForType("allied", short)).toEqual([
      "basics",
      "logo-cover",
      "hours",
      "events",
      "links",
      "discount",
    ]);
    expect(numberedStepsForType("mobile", short)).toEqual(["basics", "logo-cover", "hours", "links"]);
  });

  it("welcome and theme are not part of the flow", () => {
    for (const step of ["welcome", "theme"] as const) {
      expect(isStepForType(step, "producer", short)).toBe(false);
      expect(stepPosition(step, "producer", short)).toBeNull();
    }
    expect(allStepsForType("producer", short)).toEqual([
      "basics",
      "logo-cover",
      "hours",
      "events",
      "links",
      "review",
      "preview",
      "publish",
      "live",
    ]);
  });

  it("links leads to review, and nothing comes before basics", () => {
    expect(nextStep("links", "producer", short)).toBe("review");
    expect(nextStep("discount", "allied", short)).toBe("review");
    expect(previousStep("basics", "producer", short)).toBeNull();
    expect(previousStep("review", "producer", short)).toBe("links");
  });

  it("basics stays required; the optional steps stay skippable", () => {
    expect(canSkipStep("basics", short)).toBe(false);
    expect(canSkipStep("links", short)).toBe(true);
  });

  it("without options, today's results are unchanged", () => {
    expect(numberedStepsForType("producer", {})).toEqual(numberedStepsForType("producer"));
    expect(numberedStepsForType("producer")).toHaveLength(7);
    expect(nextStep("links", "producer")).toBe("theme");
    expect(previousStep("basics", "producer")).toBe("welcome");
    expect(stepPosition("basics", "producer")).toEqual({ number: 2, total: 7 });
    expect(isStepForType("theme", "producer")).toBe(true);
  });

  describe("resolveSetupAccess", () => {
    const base = { memberType: "producer" as const, role: "owner" as const };
    const typed = { ...base, typeConfirmed: true, setupCompleted: false };
    const done = { ...base, typeConfirmed: true, setupCompleted: true };

    it("sends welcome, the retired type step and theme to basics, in setup or after", () => {
      for (const state of [typed, done]) {
        for (const step of ["welcome", "type", "theme"]) {
          expect(resolveSetupAccess({ ...state, step }, short)).toEqual({ kind: "step", step: "basics" });
        }
      }
    });

    it("opens basics, and sends later steps back to it until setup is complete", () => {
      expect(resolveSetupAccess({ ...typed, step: "basics" }, short)).toEqual({ kind: "ok" });
      expect(resolveSetupAccess({ ...typed, step: "links" }, short)).toEqual({ kind: "step", step: "basics" });
      expect(resolveSetupAccess({ ...typed, step: "nope" }, short)).toEqual({ kind: "step", step: "basics" });
      expect(resolveSetupAccess({ ...done, step: "links" }, short)).toEqual({ kind: "ok" });
    });

    it("an unconfirmed type never loops: the shell confirms it on entry, basics stays open", () => {
      const fresh = { ...base, typeConfirmed: false, setupCompleted: false };
      expect(resolveSetupAccess({ ...fresh, step: "basics" }, short)).toEqual({ kind: "ok" });
      expect(resolveSetupAccess({ ...fresh, step: "type" }, short)).toEqual({ kind: "step", step: "basics" });
      expect(resolveSetupAccess({ ...fresh, step: "welcome" }, short)).toEqual({ kind: "step", step: "basics" });
    });

    it("without options, welcome stays open", () => {
      expect(resolveSetupAccess({ ...typed, step: "welcome" })).toEqual({ kind: "ok" });
    });
  });
});
