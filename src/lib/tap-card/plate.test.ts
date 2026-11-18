import { describe, expect, it } from "vitest";
import { PLATE_MAX_MISSES, plateUrl, safeHolderNext, staffCodeMatches, triesLeft, validateStaffCode } from "@/lib/tap-card/plate";

describe("validateStaffCode", () => {
  it("takes exactly 4 digits", () => {
    expect(validateStaffCode(" 0420 ")).toEqual({ ok: true, code: "0420" });
    for (const bad of ["420", "12a4", "12345", ""]) expect(validateStaffCode(bad)).toEqual({ ok: false, message: "Use 4 digits." });
  });
});

describe("staffCodeMatches", () => {
  it("matches only the stored code", () => {
    expect(staffCodeMatches("0420", "0420")).toBe(true);
    expect(staffCodeMatches(" 0420", "0420")).toBe(true);
    expect(staffCodeMatches("0421", "0420")).toBe(false);
    expect(staffCodeMatches("0420", null)).toBe(false);
  });
});

describe("plateUrl", () => {
  it("is the site's /t/ link", () => {
    expect(plateUrl("https://x.org", "ABCD2345")).toBe("https://x.org/t/ABCD2345");
  });
});

describe("triesLeft", () => {
  it("counts down from 5 wrong codes", () => {
    expect(PLATE_MAX_MISSES).toBe(5);
    expect(triesLeft(1)).toBe(4);
    expect(triesLeft(5)).toBe(0);
    expect(triesLeft(9)).toBe(0);
  });
});

describe("safeHolderNext", () => {
  it("only allows a plate page or the card page after signing in", () => {
    expect(safeHolderNext("/t/ABCD2345")).toBe("/t/ABCD2345");
    expect(safeHolderNext("/card")).toBe("/card");
    expect(safeHolderNext("https://evil.example/t/ABCD2345")).toBeNull();
    expect(safeHolderNext("//evil.example")).toBeNull();
    expect(safeHolderNext("/t/ABCD2345/../../admin")).toBeNull();
    expect(safeHolderNext(undefined)).toBeNull();
  });
});
