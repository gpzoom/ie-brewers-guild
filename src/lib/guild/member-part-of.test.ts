import { describe, expect, it, vi } from "vitest";
import { addMemberToast, runPartOfStep } from "./member-part-of";

describe("runPartOfStep (Add member's Part of, after the insert)", () => {
  it("leaves it alone when Part of wasn't sent or already matches", async () => {
    const apply = vi.fn();
    expect(await runPartOfStep(apply, null, undefined)).toBeNull();
    expect(await runPartOfStep(apply, "b1", "b1")).toBeNull();
    expect(await runPartOfStep(apply, null, null)).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies a different choice", async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    expect(await runPartOfStep(apply, "b1", null)).toBeNull();
    expect(apply).toHaveBeenCalledWith(null);
  });

  it("returns the refusal instead of throwing, so the created member is never re-created", async () => {
    const apply = vi.fn().mockRejectedValue(new Error("That business is run by one manager."));
    expect(await runPartOfStep(apply, null, "b1")).toBe("That business is run by one manager.");
  });
});

describe("addMemberToast", () => {
  it("success when Part of saved", () => {
    expect(addMemberToast("Hangar 24", null)).toEqual({
      kind: "success",
      message: "Added Hangar 24",
    });
  });

  it("warning naming the Part of error and where to fix it", () => {
    expect(addMemberToast("Hangar 24", "Nope")).toEqual({
      kind: "warning",
      message:
        "Added Hangar 24, but Part of wasn't saved: Nope. Set it from the row's Part of… menu.",
    });
    // A database message that already ends in a period doesn't double it.
    expect(addMemberToast("Hangar 24", "Nope.").message).toContain("saved: Nope. Set it");
  });
});
