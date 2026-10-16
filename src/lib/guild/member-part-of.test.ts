import { describe, expect, it, vi } from "vitest";
import { addMemberPartOf, addMemberToast, runPartOfStep } from "./member-part-of";

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

describe("addMemberPartOf (Add member's Part of select)", () => {
  const businesses = [{ id: "b1", name: "Hangar 24" }];
  const singles = [
    { id: "m1", name: "Brew Rebellion" },
    { id: "m2", name: "Brew Rebellion" },
  ];

  it("name matches a business: preselects and sends it", () => {
    expect(
      addMemberPartOf({ typedName: " Hangar 24 ", businesses, singles, choice: null }),
    ).toEqual({ selected: "b1", send: "b1" });
  });

  it("name matches a single location: preselects the first one and sends its id", () => {
    expect(
      addMemberPartOf({ typedName: "Brew Rebellion", businesses, singles, choice: null }),
    ).toEqual({ selected: "m1", send: "m1" });
  });

  it("matching is case-sensitive, like the database's name rule", () => {
    expect(
      addMemberPartOf({ typedName: "hangar 24", businesses, singles, choice: null }).selected,
    ).toBe("");
  });

  it("no match and untouched: None shown, but leaves it to the name rule (undefined)", () => {
    expect(addMemberPartOf({ typedName: "New Place", businesses, singles, choice: null })).toEqual({
      selected: "",
      send: undefined,
    });
  });

  it("touched None: a real 'no business' (null), even when the name matches", () => {
    expect(
      addMemberPartOf({ typedName: "Brew Rebellion", businesses, singles, choice: "" }),
    ).toEqual({ selected: "", send: null });
    expect(addMemberPartOf({ typedName: "New Place", businesses, singles, choice: "" })).toEqual({
      selected: "",
      send: null,
    });
  });

  it("touched choice wins over the name", () => {
    expect(addMemberPartOf({ typedName: "Hangar 24", businesses, singles, choice: "m2" })).toEqual({
      selected: "m2",
      send: "m2",
    });
  });
});
