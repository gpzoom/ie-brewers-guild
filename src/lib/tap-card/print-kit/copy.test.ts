import { describe, expect, it } from "vitest";
import { PLATE_COPY, REPRINT_NOTICE, STAFF_COPY, kitFileName, plateCodeLine, printFooter } from "./copy";

describe("print-kit copy", () => {
  it("has the plate wording", () => {
    expect(PLATE_COPY).toEqual({
      band: "INLAND SCAN PASS",
      headline: "SCAN TO CHECK IN",
      line: "Get your free Scan Pass · earn rewards here.",
      trailBadge: "BEER TRAIL STOP",
    });
  });

  it("has the staff wording", () => {
    expect(STAFF_COPY).toEqual({
      eyebrow: "STAFF ONLY · keep behind the counter",
      howTo: "After a customer chooses at the plate, hold this up for them to scan.",
    });
  });

  it("prints the plate code line", () => {
    expect(plateCodeLine("68JJ-PT27")).toBe("code 68JJ-PT27");
  });

  it("has a footer per piece", () => {
    expect(printFooter("counter-card")).toBe("Print at 100% / Actual size. Cut on the gray lines.");
    expect(printFooter("staff-cards")).toBe("Print at 100% / Actual size. Cut on the gray lines.");
    expect(printFooter("table-tent")).toBe("Print at 100% / Actual size. Fold on the dashed line.");
  });

  it("names the files", () => {
    expect(kitFileName("counter-card", "sample-brewery-1")).toBe("scan-pass-counter-card-sample-brewery-1.pdf");
    expect(kitFileName("table-tent", "sample-brewery-1")).toBe("scan-pass-table-tent-sample-brewery-1.pdf");
    expect(kitFileName("staff-cards", "sample-brewery-1")).toBe("scan-pass-staff-cards-sample-brewery-1.pdf");
    expect(kitFileName("counter-card", "")).toBe("scan-pass-counter-card.pdf");
  });

  it("has the reprint notices", () => {
    expect(REPRINT_NOTICE.plate).toBe(
      "New plate link made. Download and print a new counter card and table tent: the old ones no longer work.",
    );
    expect(REPRINT_NOTICE.staff).toBe("New staff QR made. Download and print new staff cards: the old ones no longer work.");
  });

  it("never promises the paid pass, a price or the nickel offer", () => {
    const all = [...Object.values(PLATE_COPY), ...Object.values(STAFF_COPY), ...Object.values(REPRINT_NOTICE)].join(" ");
    expect(all).not.toMatch(/nickel|\$|price|beer trail pass|buy|paid/i);
  });
});
