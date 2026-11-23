import { describe, expect, it } from "vitest";
import { cleanStaffName, generatePin, matchPin, plateIsOn, sharedPinSaveError, type PersonalPin } from "@/lib/tap-card/staff-codes";

const NAME_ERROR = "Type a name of 1 to 40 characters.";

describe("cleanStaffName", () => {
  it("trims, squeezes spaces and makes a case-free key", () => {
    expect(cleanStaffName("  Maria   L ")).toEqual({ ok: true, name: "Maria L", key: "maria l" });
  });
  it("refuses empty, blank and over 40 characters", () => {
    expect(cleanStaffName("")).toEqual({ ok: false, message: NAME_ERROR });
    expect(cleanStaffName("   ")).toEqual({ ok: false, message: NAME_ERROR });
    expect(cleanStaffName("x".repeat(41))).toEqual({ ok: false, message: NAME_ERROR });
    expect(cleanStaffName(undefined as unknown as string)).toEqual({ ok: false, message: NAME_ERROR });
  });
  it("accepts exactly 40 characters", () => {
    expect(cleanStaffName("x".repeat(40)).ok).toBe(true);
  });
  it("the same name in other case or spacing has the same key", () => {
    const a = cleanStaffName("MARIA  l");
    const b = cleanStaffName("maria L");
    expect(a.ok && b.ok && a.key === b.key).toBe(true);
  });
});

describe("generatePin", () => {
  it("returns 4 digits and never a taken code", () => {
    const taken = new Set(["0000", "0001", "0002"]);
    for (let i = 0; i < 200; i++) {
      const pin = generatePin(taken)!;
      expect(pin).toMatch(/^[0-9]{4}$/);
      expect(taken.has(pin)).toBe(false);
    }
  });
  it("uses the injected random and can reach both ends", () => {
    expect(generatePin(new Set(), () => 0)).toBe("0000");
    expect(generatePin(new Set(), () => 0.9999999)).toBe("9999");
    expect(generatePin(new Set(["0000"]), () => 0)).toBe("0001");
  });
  it("finds the one code left", () => {
    const taken = new Set<string>();
    for (let n = 0; n < 10000; n++) if (n !== 4321) taken.add(String(n).padStart(4, "0"));
    expect(generatePin(taken)).toBe("4321");
  });
  it("returns null when all 10,000 are taken", () => {
    const taken = new Set<string>();
    for (let n = 0; n < 10000; n++) taken.add(String(n).padStart(4, "0"));
    expect(generatePin(taken)).toBeNull();
  });
  it("default randomness is spread across the range", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(generatePin(new Set())!);
    expect(seen.size).toBeGreaterThan(250);
  });
});

describe("matchPin", () => {
  const personal: PersonalPin[] = [
    { codeId: "c1", staffId: "s1", code: "1111", active: true },
    { codeId: "c2", staffId: "s2", code: "2222", active: false },
  ];
  it("an active personal code names the staff member", () => {
    expect(matchPin("1111", { shared: null, sharedOff: false, personal })).toEqual({ source: "staff", staffId: "s1", codeId: "c1" });
    expect(matchPin(" 1111 ", { shared: null, sharedOff: false, personal })).toEqual({ source: "staff", staffId: "s1", codeId: "c1" });
  });
  it("an inactive personal code does not match", () => {
    expect(matchPin("2222", { shared: null, sharedOff: false, personal })).toBeNull();
  });
  it("the shared code matches when on", () => {
    expect(matchPin("3333", { shared: "3333", sharedOff: false, personal })).toEqual({ source: "staff-code" });
  });
  it("the shared code does not match when off", () => {
    expect(matchPin("3333", { shared: "3333", sharedOff: true, personal })).toBeNull();
  });
  it("a personal code equal to an on shared code counts as shared", () => {
    expect(matchPin("1111", { shared: "1111", sharedOff: false, personal })).toEqual({ source: "staff-code" });
  });
  it("a personal code equal to an off shared code counts as staff", () => {
    expect(matchPin("1111", { shared: "1111", sharedOff: true, personal })).toEqual({ source: "staff", staffId: "s1", codeId: "c1" });
  });
  it("unknown codes and no codes at all do not match", () => {
    expect(matchPin("9999", { shared: "3333", sharedOff: false, personal })).toBeNull();
    expect(matchPin("1111", { shared: null, sharedOff: false, personal: [] })).toBeNull();
  });
});

describe("plateIsOn", () => {
  it("a shared code keeps it on even if turned off", () => {
    expect(plateIsOn({ shared: "1234", personalActive: 0 })).toBe(true);
  });
  it("without a shared code, needs an active personal code", () => {
    expect(plateIsOn({ shared: null, personalActive: 1 })).toBe(true);
    expect(plateIsOn({ shared: null, personalActive: 0 })).toBe(false);
  });
});

describe("sharedPinSaveError", () => {
  it("refuses a code a staff member already has", () => {
    expect(sharedPinSaveError("1111", new Set(["1111"]))).toBe("That code belongs to a staff member. Choose another.");
  });
  it("allows any other code", () => {
    expect(sharedPinSaveError("2222", new Set(["1111"]))).toBeNull();
  });
});
