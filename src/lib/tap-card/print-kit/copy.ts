/**
 * Every string the Scan Pass print kit prints (spec
 * docs/superpowers/specs/2026-11-21-scan-pass-print-kit-design.md).
 * Cards sit on counters for months, so the wording is always true: it never
 * names the paid Beer Trail pass, a price or the nickel-beer offer.
 */

export type KitPiece = "counter-card" | "table-tent" | "staff-cards";

export const PLATE_COPY = {
  band: "INLAND SCAN PASS",
  headline: "SCAN TO CHECK IN",
  line: "Get your free Scan Pass · earn rewards here.",
  trailBadge: "BEER TRAIL STOP",
} as const;

/** No 4-digit staff code is ever printed (owner, 2026-11-21). */
export const STAFF_COPY = {
  eyebrow: "STAFF ONLY · keep behind the counter",
  howTo: "After a customer chooses at the plate, hold this up for them to scan.",
} as const;

export const REPRINT_NOTICE = {
  plate: "New plate link made. Your printed counter cards and table tents no longer work: use Print kit above to print new ones.",
  staff: "New staff QR made. Your printed staff cards no longer work: use Print kit above to print new ones.",
} as const;

/** Server messages a member can act on (requireTapCardEditor); everything else stays generic. */
const ACTIONABLE_ERRORS = ["Please sign in again.", "Only the owner or a full editor can manage the Scan Pass."];

export function kitErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  return ACTIONABLE_ERRORS.includes(message) ? message : "Couldn't make the PDF. Try again.";
}

export function plateCodeLine(printedCode: string): string {
  return `code ${printedCode}`;
}

export function printFooter(piece: KitPiece): string {
  return piece === "table-tent"
    ? "Print at 100% / Actual size. Fold on the dashed line."
    : "Print at 100% / Actual size. Cut on the gray lines.";
}

export function kitFileName(piece: KitPiece, memberSlug: string): string {
  const slug = memberSlug.trim();
  return slug ? `scan-pass-${piece}-${slug}.pdf` : `scan-pass-${piece}.pdf`;
}
