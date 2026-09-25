import { describe, expect, it } from "vitest";
import { applyDiscountXor, assertValidDiscountPercent } from "./discount";

describe("assertValidDiscountPercent -- server-side range validation", () => {
  it("accepts the lower boundary, exactly 0", () => {
    expect(() => assertValidDiscountPercent(0)).not.toThrow();
  });

  it("accepts the upper boundary, exactly 100", () => {
    expect(() => assertValidDiscountPercent(100)).not.toThrow();
  });

  it("accepts an ordinary in-range value", () => {
    expect(() => assertValidDiscountPercent(15)).not.toThrow();
  });

  it("rejects a negative value", () => {
    expect(() => assertValidDiscountPercent(-5)).toThrow(/between 0 and 100/);
  });

  it("rejects a value far above the business range", () => {
    expect(() => assertValidDiscountPercent(500)).toThrow(/between 0 and 100/);
  });

  it("rejects a value just past the upper boundary", () => {
    expect(() => assertValidDiscountPercent(101)).toThrow(/between 0 and 100/);
  });

  it("rejects NaN", () => {
    expect(() => assertValidDiscountPercent(NaN)).toThrow(/between 0 and 100/);
  });

  it("rejects Infinity", () => {
    expect(() => assertValidDiscountPercent(Infinity)).toThrow(/between 0 and 100/);
  });

  it("allows null -- clearing the percent is legitimate, not a validation failure", () => {
    expect(() => assertValidDiscountPercent(null)).not.toThrow();
  });

  it("allows undefined -- an absent field on a partial patch is not a validation failure", () => {
    expect(() => assertValidDiscountPercent(undefined)).not.toThrow();
  });
});

describe("applyDiscountXor -- shared client/server XOR mutation", () => {
  it("nulls discount_percent when discount_no_fixed_percent is set true", () => {
    expect(applyDiscountXor({ discount_no_fixed_percent: true })).toEqual({
      discount_no_fixed_percent: true,
      discount_percent: null,
    });
  });

  it("clears discount_no_fixed_percent when a numeric discount_percent is set", () => {
    expect(applyDiscountXor({ discount_percent: 20 })).toEqual({
      discount_percent: 20,
      discount_no_fixed_percent: false,
    });
  });

  it("leaves a patch with neither field untouched", () => {
    expect(applyDiscountXor({ discount_redeem_text: "Ask at the bar" })).toEqual({
      discount_redeem_text: "Ask at the bar",
    });
  });

  it("does not touch discount_percent when discount_no_fixed_percent is set false", () => {
    // The reviewed bug's second step: unchecking the box must NOT touch
    // discount_percent at all (it should stay whatever it already is --
    // null, from the check step -- not get reset to some other value).
    expect(applyDiscountXor({ discount_no_fixed_percent: false })).toEqual({
      discount_no_fixed_percent: false,
    });
  });

  /**
   * Full trace of the reviewed bug's exact repro sequence, at the level
   * DiscountEditor.tsx's save() actually operates: a tiny in-memory model
   * of `local` state that applies applyDiscountXor the same way save()
   * does, confirming the CLIENT-side half of the fix (the SERVER-side
   * XOR behavior for the same sequence is covered separately by
   * "nulls out discount_percent..."/"clears discount_no_fixed_percent..."
   * in the describe block below). This doesn't render DiscountEditor's
   * JSX (this repo has no React component test harness -- confirmed via
   * a repo-wide search for *.test.tsx, zero hits), but it exercises the
   * exact non-JSX logic save()'s doc comment describes, function call for
   * function call.
   *
   * 1. Member checks "No fixed percentage".
   * 2. Member unchecks it again.
   * 3. `local.discount_percent` must now read as empty/null, NOT the
   *    original pre-toggle value -- this is what proves the Input's
   *    `key={String(local.discount_no_fixed_percent)}` remount (the
   *    other half of the fix, in DiscountEditor.tsx) will read a fresh
   *    `defaultValue=""` rather than a stale number when it remounts.
   * 4. An ordinary blur with NO retyping (empty string) must send
   *    `{ discount_percent: null }` and nothing else -- specifically
   *    must NOT resurrect discount_no_fixed_percent back to false's
   *    sibling truthy percent, i.e. must not silently revert step 2's
   *    choice.
   */
  it("full repro trace: check -> uncheck -> blur-with-no-retyping never resurrects the old percent", () => {
    let local: { discount_percent: number | null; discount_no_fixed_percent: boolean } = {
      discount_percent: 15,
      discount_no_fixed_percent: false,
    };

    // Same shape as DiscountEditor.tsx's save(): apply applyDiscountXor to
    // the raw patch, then merge the RESULT into local state.
    function simulateSave(rawPatch: Partial<typeof local>) {
      const patch = applyDiscountXor(rawPatch as Parameters<typeof applyDiscountXor>[0]);
      local = { ...local, ...patch };
      return patch;
    }

    // Step 1: check "No fixed percentage" (Checkbox's onCheckedChange ->
    // save({ discount_no_fixed_percent: true })).
    simulateSave({ discount_no_fixed_percent: true });
    expect(local).toEqual({ discount_no_fixed_percent: true, discount_percent: null });

    // Step 2: uncheck it again (save({ discount_no_fixed_percent: false })).
    simulateSave({ discount_no_fixed_percent: false });
    // Step 3: local.discount_percent reads as null (empty), not the
    // original 15 -- the Input's key remount will now show "" instead of
    // a stale "15".
    expect(local.discount_percent).toBeNull();
    expect(local.discount_no_fixed_percent).toBe(false);

    // Step 4: an ordinary blur on the now-empty, now-re-enabled field,
    // with no retyping -- DiscountEditor's onBlur does
    // `e.target.value ? Number(e.target.value) : null`, and an empty
    // input's e.target.value is "", so this is save({ discount_percent: null }).
    const sentPatch = simulateSave({ discount_percent: null });
    expect(sentPatch).toEqual({ discount_percent: null });
    // The critical assertion: discount_no_fixed_percent must NOT be
    // present in what gets sent to the server (and therefore isn't
    // flipped back to false as a side effect of a stale resurrected
    // value) -- it was already false from step 2, and this patch leaves
    // it alone rather than reasserting it via a resurrected old number.
    expect(sentPatch).not.toHaveProperty("discount_no_fixed_percent");
    expect(local).toEqual({ discount_percent: null, discount_no_fixed_percent: false });
  });
});
