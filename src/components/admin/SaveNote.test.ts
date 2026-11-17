import { describe, expect, it } from "vitest";
import { saveNoteText } from "./SaveNote";

describe("saveNoteText", () => {
  it("members are told their own Publish puts changes live", () => {
    expect(saveNoteText(true)).toBe("Changes save as you type and go live when you publish.");
    expect(saveNoteText(false)).toBe("Changes save as you type. Your profile stays hidden until you publish it.");
  });

  it("a Join applicant is told the Guild reviews it, not to publish", () => {
    expect(saveNoteText(false, true)).toBe(
      "Changes save as you type. The Guild reviews your application before your page goes live.",
    );
  });
});
