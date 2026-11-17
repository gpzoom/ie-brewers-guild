import { describe, expect, it } from "vitest";
import { CARD_CODE_ALPHABET, cardUrl, formatCardCode, generateCardCode, normalizeCardCode } from "./card-code";

describe("card codes", () => {
  it("uses Crockford base32 (no I, L, O, U)", () => {
    expect(CARD_CODE_ALPHABET).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
  });

  it("generates 8 characters from the alphabet", () => {
    for (let i = 0; i < 1000; i++) expect(generateCardCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("normalizes what people type", () => {
    expect(normalizeCardCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeCardCode(" oil1 2345 ")).toBe("01112345");
    expect(normalizeCardCode("ABCU1234")).toBeNull();
    expect(normalizeCardCode("ABCD123")).toBeNull();
    expect(normalizeCardCode("ABCD12345")).toBeNull();
    expect(normalizeCardCode("")).toBeNull();
  });

  it("formats for printing", () => {
    expect(formatCardCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("builds the card link", () => {
    expect(cardUrl("https://iscbrewersguild.org", "ABCDEFGH")).toBe("https://iscbrewersguild.org/p/ABCDEFGH");
  });
});
