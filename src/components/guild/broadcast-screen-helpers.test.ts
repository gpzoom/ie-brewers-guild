import { describe, expect, it } from "vitest";
import {
  audienceFromForm,
  confirmDescription,
  confirmTitle,
  finishConfirmTitle,
  finishedTitle,
  formatAttachmentSize,
  formFromAudience,
  isSendRefusal,
  normalizeLinkUrl,
  progressText,
  recentAudienceLine,
  sendingTimeText,
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
    expect(finishedTitle(37)).toBe("Finished sending. Sent to 37 people in all.");
    expect(finishConfirmTitle(19)).toBe("Finish sending to 19 people?");
    expect(finishConfirmTitle(1)).toBe("Finish sending to 1 person?");
  });

  it("says roughly how long sending takes (80 people a minute, at least 1 minute)", () => {
    const tail = "Keep this page open — if it's interrupted, you can finish later from Recent broadcasts.";
    expect(sendingTimeText(1)).toBe(`Sending takes about 1 minute for 1 person. ${tail}`);
    expect(sendingTimeText(80)).toBe(`Sending takes about 1 minute for 80 people. ${tail}`);
    expect(sendingTimeText(81)).toBe(`Sending takes about 2 minutes for 81 people. ${tail}`);
    expect(sendingTimeText(300)).toBe(`Sending takes about 4 minutes for 300 people. ${tail}`);
  });

  it("knows the batching refusals", () => {
    expect(isSendRefusal("That message is too long. Shorten it or attach a file instead.")).toBe(true);
    expect(
      isSendRefusal("An attachment for this broadcast is missing, so it can't be finished. Use Mark as stopped."),
    ).toBe(true);
    expect(isSendRefusal("That broadcast wasn't found.")).toBe(true);
  });

  it("labels a broadcast marked as stopped partway", () => {
    expect(
      recentAudienceLine({
        audienceLabel: "All members",
        recipient_count: 19,
        status: "failed",
        failedCount: 1,
        processedCount: 20,
        totalCount: 30,
      }),
    ).toBe("All members · 19 people · stopped after 20 of 30");
    expect(
      recentAudienceLine({
        audienceLabel: "All members",
        recipient_count: 0,
        status: "failed",
        failedCount: 3,
        processedCount: 3,
        totalCount: 3,
      }),
    ).toBe("All members · 0 people · failed");
  });

  it("words the progress line while batches go out", () => {
    expect(progressText(0, 45)).toBe("Sent 0 of 45…");
    expect(progressText(20, 45)).toBe("Sent 20 of 45…");
  });

  it("formats attachment sizes in MB with one decimal, KB under 1 MB", () => {
    expect(formatAttachmentSize(2.1 * 1024 * 1024)).toBe("2.1 MB");
    expect(formatAttachmentSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatAttachmentSize(340 * 1024)).toBe("340 KB");
    expect(formatAttachmentSize(12)).toBe("1 KB");
  });

  it("describes a recent broadcast, flagging a failed one", () => {
    expect(
      recentAudienceLine({ audienceLabel: "All members", recipient_count: 31, status: "sent", failedCount: 0 }),
    ).toBe("All members · 31 people");
    expect(
      recentAudienceLine({ audienceLabel: "All members", recipient_count: 0, status: "failed", failedCount: 3 }),
    ).toBe("All members · 0 people · failed");
  });

  it("shows how many addresses failed on a sent broadcast", () => {
    expect(
      recentAudienceLine({ audienceLabel: "All members", recipient_count: 29, status: "sent", failedCount: 2 }),
    ).toBe("All members · 29 people · 2 failed");
  });

  it("flags a send still going, and one that was cut off", () => {
    expect(
      recentAudienceLine({ audienceLabel: "All members", recipient_count: 4, status: "sending", failedCount: 0 }),
    ).toBe("All members · 4 people · sending…");
    expect(
      recentAudienceLine({
        audienceLabel: "All members",
        recipient_count: 20,
        status: "interrupted",
        failedCount: 1,
        processedCount: 21,
        totalCount: 40,
      }),
    ).toBe("All members · 20 people · interrupted after 21 of 40");
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
    expect(isSendRefusal("Your account has no email address to send from.")).toBe(true);
    expect(isSendRefusal("Not signed in.")).toBe(true);
    expect(isSendRefusal("A broadcast is still sending. Wait a few minutes and check Recent broadcasts.")).toBe(true);
    expect(isSendRefusal("Couldn't start the send. Nothing was sent.")).toBe(true);
  });
  it("treats anything else as possibly sent", () => {
    expect(isSendRefusal("Failed to fetch")).toBe(false);
    expect(isSendRefusal("NetworkError when attempting to fetch resource.")).toBe(false);
    expect(isSendRefusal("")).toBe(false);
  });
});
