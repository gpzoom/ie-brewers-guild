import { describe, expect, it } from "vitest";
import {
  allStepsForType,
  canSkipStep,
  isSetupStepName,
  nextStep,
  numberedStepsForType,
  previousStep,
  resolveSetupAccess,
  stepLabel,
  stepPosition,
} from "./wizard-steps";

describe("numberedStepsForType", () => {
  it("a producer sees eight steps: no discount", () => {
    expect(numberedStepsForType("producer")).toEqual([
      "welcome",
      "type",
      "basics",
      "logo-cover",
      "hours",
      "events",
      "links",
      "theme",
    ]);
  });

  it("a mobile member sees seven: no separate events step, no discount", () => {
    expect(numberedStepsForType("mobile")).toEqual([
      "welcome",
      "type",
      "basics",
      "logo-cover",
      "hours",
      "links",
      "theme",
    ]);
  });

  it("an Affiliate Member sees all nine", () => {
    expect(numberedStepsForType("allied")).toHaveLength(9);
    expect(numberedStepsForType("allied")).toContain("discount");
  });

  it("the finish screens follow the numbered steps", () => {
    expect(allStepsForType("producer").slice(-4)).toEqual(["review", "preview", "publish", "live"]);
  });
});

describe("stepPosition", () => {
  it("matches StepAnatomy: hours is step 5 of 8 for a producer", () => {
    expect(stepPosition("hours", "producer")).toEqual({ number: 5, total: 8 });
  });

  it("counts only the type's own steps", () => {
    expect(stepPosition("links", "mobile")).toEqual({ number: 6, total: 7 });
    expect(stepPosition("theme", "allied")).toEqual({ number: 9, total: 9 });
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
  it("calls step 5 'Where we'll be' for a mobile member", () => {
    expect(stepLabel("hours", "mobile")).toBe("Where we'll be");
    expect(stepLabel("hours", "producer")).toBe("When you're open");
  });

  it("offers Skip for now on every optional step, never on type or basics", () => {
    expect(canSkipStep("type")).toBe(false);
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

    it("opens welcome and type", () => {
      expect(resolveSetupAccess({ ...fresh, step: "welcome" })).toEqual({ kind: "ok" });
      expect(resolveSetupAccess({ ...fresh, step: "type" })).toEqual({ kind: "ok" });
    });

    it("sends basics back to type until the type is confirmed", () => {
      expect(resolveSetupAccess({ ...fresh, step: "basics" })).toEqual({
        kind: "step",
        step: "type",
      });
      expect(resolveSetupAccess({ ...typed, step: "basics" })).toEqual({ kind: "ok" });
    });

    it("keeps Confirm type open once confirmed (it shows the locked type)", () => {
      expect(resolveSetupAccess({ ...typed, step: "type" })).toEqual({ kind: "ok" });
    });

    it("sends later steps to the first incomplete of steps 1-3", () => {
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
        "type",
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
  it("labels step 4 and step 9 with their new names", () => {
    expect(stepLabel("logo-cover", "producer")).toBe("Logo, Photos & Cover");
    expect(stepLabel("theme", "producer")).toBe("Pick your theme");
  });

  it("a producer's step 4 is step 4 of 8", () => {
    expect(stepPosition("logo-cover", "producer")).toEqual({ number: 4, total: 8 });
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
