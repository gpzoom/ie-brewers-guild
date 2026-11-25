import { describe, expect, it } from "vitest";
import { PLATE_COPY, PRINT_FOOTER, REPRINT_NOTICE, STAFF_COPY, kitErrorMessage, kitFileName, plateCodeLine } from "./copy";

describe("print-kit copy", () => {
  it("has the plate wording", () => {
    expect(PLATE_COPY).toEqual({
      band: "INLAND SCAN PASS",
      headline: "GET YOUR SCAN PASS",
      line: "Free on your phone · earn rewards here.",
      trailBadge: "BEER TRAIL STOP",
    });
  });

  it("has the staff wording", () => {
    expect(STAFF_COPY).toEqual({
      eyebrow: "STAFF ONLY · keep behind the counter",
      howTo: "Hold this up for the customer to scan, then look for the live green screen.",
    });
  });

  it("prints the plate code line", () => {
    expect(plateCodeLine("68JJ-PT27")).toBe("code 68JJ-PT27");
  });

  it("has one print footer for the cut sheets (the tent has none)", () => {
    expect(PRINT_FOOTER).toBe("Print at 100% / Actual size. Cut on the gray lines.");
  });

  it("names the files", () => {
    expect(kitFileName("counter-card", "sample-brewery-1")).toBe("scan-pass-counter-card-sample-brewery-1.pdf");
    expect(kitFileName("table-tent", "sample-brewery-1")).toBe("scan-pass-table-tent-sample-brewery-1.pdf");
    expect(kitFileName("staff-cards", "sample-brewery-1")).toBe("scan-pass-staff-cards-sample-brewery-1.pdf");
    expect(kitFileName("counter-card", "")).toBe("scan-pass-counter-card.pdf");
    expect(kitFileName("staff-cards", "sample-brewery-1", "José / O'Neil")).toBe("scan-pass-staff-cards-jose-o-neil-sample-brewery-1.pdf");
    expect(kitFileName("staff-cards", "sample-brewery-1", "../..")).toBe("scan-pass-staff-cards-named-sample-brewery-1.pdf");
  });

  it("has the reprint notices", () => {
    expect(REPRINT_NOTICE.plate).toBe(
      "New plate link made. Your printed counter cards and table tents no longer work: use Print kit above to print new ones.",
    );
    expect(REPRINT_NOTICE.staff).toBe(
      "New staff QR made. Printed staff cards with the old QR no longer work: use Print kit above to print new ones.",
    );
  });

  it("passes sign-in and permission errors through, hides everything else", () => {
    expect(kitErrorMessage(new Error("Please sign in again."))).toBe("Please sign in again.");
    expect(kitErrorMessage(new Error("Only the owner or a full editor can manage the Scan Pass."))).toBe(
      "Only the owner or a full editor can manage the Scan Pass.",
    );
    expect(kitErrorMessage(new Error("Only the owner or a co-owner can manage staff codes."))).toBe(
      "Only the owner or a co-owner can manage staff codes.",
    );
    expect(kitErrorMessage(new Error("That staff QR was turned off. Choose another."))).toBe("That staff QR was turned off. Choose another.");
    expect(kitErrorMessage(new Error("Couldn't load /fonts/print-kit/Chivo-Regular.ttf"))).toBe("Couldn't make the PDF. Try again.");
    expect(kitErrorMessage("boom")).toBe("Couldn't make the PDF. Try again.");
    expect(kitErrorMessage(null)).toBe("Couldn't make the PDF. Try again.");
  });

  it("never promises the paid pass, a price or the nickel offer", () => {
    const all = [...Object.values(PLATE_COPY), ...Object.values(STAFF_COPY), ...Object.values(REPRINT_NOTICE)].join(" ");
    expect(all).not.toMatch(/nickel|\$|price|beer trail pass|buy|paid/i);
  });
});
