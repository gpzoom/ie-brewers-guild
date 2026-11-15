import { describe, expect, it } from "vitest";
import { validateJoinInput, type JoinInput } from "./join-validation";

const base: JoinInput = {
  email: "owner@example.com",
  businessName: "Sample Brewery",
  city: "Riverside",
  memberType: "producer",
  placeId: "ChIJabc123",
  honeypot: "",
};

describe("validateJoinInput", () => {
  it("accepts a valid producer with a place id", () => {
    const result = validateJoinInput(base);
    expect(result).toEqual({ ok: true, value: base });
  });

  it.each(["producer", "mobile", "allied"] as const)("accepts member type %s", (memberType) => {
    expect(validateJoinInput({ ...base, memberType }).ok).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = validateJoinInput({ ...base, email: "  Owner@Example.COM " });
    expect(result.ok && result.value.email).toBe("owner@example.com");
  });

  it("trims and collapses whitespace (including newlines) in name and city", () => {
    const result = validateJoinInput({ ...base, businessName: "  Sample \n\t Brewery  ", city: " Rancho\n  Cucamonga " });
    expect(result.ok && result.value.businessName).toBe("Sample Brewery");
    expect(result.ok && result.value.city).toBe("Rancho Cucamonga");
  });

  it.each(["", "   ", "not-an-email", "a@b", "a b@example.com", `${"a".repeat(320)}@example.com`])(
    "rejects email %j",
    (email) => {
      const result = validateJoinInput({ ...base, email });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors.email).toBeTruthy();
    },
  );

  it("rejects an empty business name and city", () => {
    const result = validateJoinInput({ ...base, businessName: "  \n ", city: "" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.businessName).toBeTruthy();
    expect(!result.ok && result.errors.city).toBeTruthy();
  });

  it("rejects an overlong business name and city", () => {
    const result = validateJoinInput({ ...base, businessName: "x".repeat(201), city: "y".repeat(101) });
    expect(!result.ok && result.errors.businessName).toBeTruthy();
    expect(!result.ok && result.errors.city).toBeTruthy();
  });

  it("rejects an unknown member type", () => {
    const result = validateJoinInput({ ...base, memberType: "brewery" as JoinInput["memberType"] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.memberType).toBe("Choose a member type.");
  });

  it("Mobile forces placeId to null", () => {
    const result = validateJoinInput({ ...base, memberType: "mobile", placeId: "ChIJabc123" });
    expect(result.ok && result.value.placeId).toBeNull();
  });

  it("an empty place id becomes null", () => {
    const result = validateJoinInput({ ...base, placeId: "   " });
    expect(result.ok && result.value.placeId).toBeNull();
  });

  it("drops a place id that isn't shaped like a Google place id", () => {
    for (const placeId of ["../etc", "abc def", "x".repeat(301), "<script>"]) {
      const result = validateJoinInput({ ...base, placeId });
      expect(result.ok && result.value.placeId).toBeNull();
    }
  });

  it("treats non-string fields from a hand-made request as empty", () => {
    const result = validateJoinInput({
      email: 42,
      businessName: null,
      city: { a: 1 },
      memberType: "producer",
      placeId: 7,
      honeypot: undefined,
    } as unknown as JoinInput);
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(["businessName", "city", "email"]);
  });
});
