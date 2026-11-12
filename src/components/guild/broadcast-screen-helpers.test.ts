import { describe, expect, it } from "vitest";
import {
  audienceFromForm,
  confirmDescription,
  confirmTitle,
  formatAttachmentSize,
  formFromAudience,
  isSendRefusal,
  normalizeLinkUrl,
  recentAudienceLine,
  searchMembers,
  sendButtonLabel,
  successTitle,
} from "./broadcast-screen-helpers";

describe("broadcast screen helpers", () => {
  it("labels the Send button with the people count, and Sending… while it runs", () => {
    expect(sendButtonLabel(31, false)).toBe("Send to 31 people");
    expect(sendButtonLabel(1, false)).toBe("Send to 1 person");
    expect(sendButtonLabel(0, false)).toBe("Send to 0 people");
    expect(sendButtonLabel(31, true)).toBe("Sending…");
  });

  it("words the confirm dialog and the success banner", () => {
    expect(confirmTitle(31)).toBe("Send to 31 people?");
    expect(confirmTitle(1)).toBe("Send to 1 person?");
    expect(confirmDescription("Affiliate Members · Food trucks")).toBe(
      "Affiliate Members · Food trucks. This can't be undone.",
    );
    expect(successTitle(31, 24)).toBe("Sent to 31 people across 24 members, just now.");
    expect(successTitle(1, 1)).toBe("Sent to 1 person across 1 member, just now.");
  });

  it("formats attachment sizes in MB with one decimal, KB under 1 MB", () => {
    expect(formatAttachmentSize(2.1 * 1024 * 1024)).toBe("2.1 MB");
    expect(formatAttachmentSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatAttachmentSize(340 * 1024)).toBe("340 KB");
    expect(formatAttachmentSize(12)).toBe("1 KB");
  });

  it("describes a recent broadcast, flagging a failed one", () => {
    expect(
      recentAudienceLine({ audienceLabel: "All members", recipient_count: 31, status: "sent" }),
    ).toBe("All members · 31 people");
    expect(
      recentAudienceLine({ audienceLabel: "All members", recipient_count: 0, status: "failed" }),
    ).toBe("All members · 0 people · failed");
  });

  it("turns the tabs into an audience and back", () => {
    const base = { memberType: "" as const, categoryId: "", memberIds: ["a"] };
    expect(audienceFromForm({ ...base, tab: "all" })).toEqual({ type: "all" });
    expect(audienceFromForm({ ...base, tab: "type_or_category", memberType: "allied" })).toEqual({
      type: "type_or_category",
      memberType: "allied",
      categoryId: null,
    });
    expect(audienceFromForm({ ...base, tab: "members" })).toEqual({
      type: "members",
      memberIds: ["a"],
    });
    expect(
      formFromAudience({ type: "type_or_category", memberType: null, categoryId: "c1" }),
    ).toEqual({
      tab: "type_or_category",
      memberType: "",
      categoryId: "c1",
      memberIds: [],
    });
  });

  it("searches members by name, leaving out the picked ones", () => {
    const members = [
      { id: "1", business_name: "Hangar 24" },
      { id: "2", business_name: "Ritual Brewing" },
      { id: "3", business_name: "Hangar Annex" },
    ];
    expect(searchMembers(members, " hangar ", ["3"]).map((m) => m.id)).toEqual(["1"]);
    expect(searchMembers(members, "", ["2"]).map((m) => m.id)).toEqual(["1", "3"]);
  });
});

describe("normalizeLinkUrl", () => {
  it("keeps http(s) and mailto links", () => {
    expect(normalizeLinkUrl(" https://example.com/x ")).toBe("https://example.com/x");
    expect(normalizeLinkUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeLinkUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
  });
  it("adds https:// or mailto: to a bare address", () => {
    expect(normalizeLinkUrl("example.com/fest")).toBe("https://example.com/fest");
    expect(normalizeLinkUrl("a@example.com")).toBe("mailto:a@example.com");
  });
  it("treats empty as remove, and refuses other schemes", () => {
    expect(normalizeLinkUrl("  ")).toBe("");
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("ftp://example.com")).toBeNull();
    expect(normalizeLinkUrl("just words")).toBeNull();
  });
});

describe("isSendRefusal", () => {
  it("knows the server's before-sending refusals", () => {
    expect(isSendRefusal("Add a subject.")).toBe(true);
    expect(isSendRefusal("Write a message.")).toBe(true);
    expect(isSendRefusal("No one to send to.")).toBe(true);
    expect(isSendRefusal("Only the super admin can send a broadcast email.")).toBe(true);
  });
  it("treats anything else as possibly sent", () => {
    expect(isSendRefusal("Failed to fetch")).toBe(false);
    expect(isSendRefusal("NetworkError when attempting to fetch resource.")).toBe(false);
    expect(isSendRefusal("")).toBe(false);
  });
});
