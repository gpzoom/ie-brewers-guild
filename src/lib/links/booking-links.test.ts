import { describe, expect, it } from "vitest";
import { toDisplayLinkValue, toStoredLinkUrl } from "@/lib/links/booking-links";
import { isHttpUrl } from "@/lib/links/url-safety";

describe("Instagram DM links", () => {
  it("turns @name (or a pasted profile link) into an ig.me link", () => {
    expect(toStoredLinkUrl("instagram_dm", "@rolling.taps")).toEqual({ ok: true, url: "https://ig.me/m/rolling.taps" });
    expect(toStoredLinkUrl("instagram_dm", "rolling_taps")).toEqual({ ok: true, url: "https://ig.me/m/rolling_taps" });
    expect(toStoredLinkUrl("instagram_dm", "https://www.instagram.com/rollingtaps/")).toEqual({
      ok: true,
      url: "https://ig.me/m/rollingtaps",
    });
  });

  it("refuses something that isn't an Instagram name", () => {
    expect(toStoredLinkUrl("instagram_dm", "@not a name").ok).toBe(false);
    expect(toStoredLinkUrl("instagram_dm", "javascript:alert(1)").ok).toBe(false);
  });

  it("shows the stored link back as @name", () => {
    expect(toDisplayLinkValue("instagram_dm", "https://ig.me/m/rolling.taps")).toBe("@rolling.taps");
  });
});

describe("WhatsApp links", () => {
  it("turns a US number into a wa.me link with the country code", () => {
    expect(toStoredLinkUrl("whatsapp", "(951) 555-1234")).toEqual({ ok: true, url: "https://wa.me/19515551234" });
    expect(toStoredLinkUrl("whatsapp", "+1 951 555 1234")).toEqual({ ok: true, url: "https://wa.me/19515551234" });
    expect(toStoredLinkUrl("whatsapp", "https://wa.me/19515551234")).toEqual({
      ok: true,
      url: "https://wa.me/19515551234",
    });
  });

  it("refuses a number that's too short", () => {
    expect(toStoredLinkUrl("whatsapp", "555-1234").ok).toBe(false);
  });

  it("shows a US number back in the usual format", () => {
    expect(toDisplayLinkValue("whatsapp", "https://wa.me/19515551234")).toBe("(951) 555-1234");
    expect(toDisplayLinkValue("whatsapp", "https://wa.me/447700900123")).toBe("+447700900123");
  });
});

describe("every stored booking link is a real https link", () => {
  it("passes the same URL check as every other link", () => {
    for (const [kind, input] of [
      ["instagram_dm", "@name"],
      ["whatsapp", "9515551234"],
    ] as const) {
      const stored = toStoredLinkUrl(kind, input);
      expect(stored.ok && isHttpUrl(stored.url)).toBe(true);
    }
  });

  it("leaves other link types and empty fields alone", () => {
    expect(toStoredLinkUrl("website", " https://x.example ")).toEqual({ ok: true, url: "https://x.example" });
    expect(toStoredLinkUrl("whatsapp", "  ")).toEqual({ ok: true, url: "" });
  });
});
