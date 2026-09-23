import { describe, expect, it } from "vitest";
import { getOgPlaceholderPath } from "./og-placeholder";

describe("getOgPlaceholderPath", () => {
  it("returns a distinct path per member type", () => {
    const producer = getOgPlaceholderPath("producer");
    const mobile = getOgPlaceholderPath("mobile");
    const allied = getOgPlaceholderPath("allied");
    expect(new Set([producer, mobile, allied]).size).toBe(3);
  });

  it("returns paths under /og/", () => {
    expect(getOgPlaceholderPath("producer")).toMatch(/^\/og\//);
    expect(getOgPlaceholderPath("mobile")).toMatch(/^\/og\//);
    expect(getOgPlaceholderPath("allied")).toMatch(/^\/og\//);
  });
});
