import { STAFF_CODES_OWNER_ONLY, staffNameSlug } from "@/lib/tap-card/staff-codes";
import { STAFF_QR_GONE } from "@/lib/tap-card/staff-codes-screen";

/**
 * Every string the Scan Pass print kit prints (spec
 * docs/superpowers/specs/2026-11-21-scan-pass-print-kit-design.md).
 * Cards sit on counters for months, so the wording is always true: it never
 * names the paid Beer Trail pass, a price or the nickel-beer offer.
 */

export type KitPiece = "counter-card" | "table-tent" | "staff-cards";

export const PLATE_COPY = {
  band: "INLAND SCAN PASS",
  headline: "GET YOUR SCAN PASS",
  line: "Free on your phone · earn rewards here.",
  trailBadge: "BEER TRAIL STOP",
} as const;

/** No 4-digit staff code is ever printed (owner, 2026-11-21). */
export const STAFF_COPY = {
  eyebrow: "STAFF ONLY · keep behind the counter",
  howTo: "Hold this up for the customer to scan, then look for the live green screen.",
} as const;

export const REPRINT_NOTICE = {
  plate: "New plate link made. Your printed counter cards and table tents no longer work: use Print kit above to print new ones.",
  staff: "New staff QR made. Printed staff cards with the old QR no longer work: use Print kit above to print new ones.",
} as const;

/** Messages a member can act on (requireTapCardEditor, requireTapCardOwner); everything else stays generic. */
const ACTIONABLE_ERRORS = [
  "Please sign in again.",
  "Only the owner or a full editor can manage the Scan Pass.",
  STAFF_CODES_OWNER_ONLY,
  STAFF_QR_GONE,
];

export function kitErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  return ACTIONABLE_ERRORS.includes(message) ? message : "Couldn't make the PDF. Try again.";
}

export function plateCodeLine(printedCode: string): string {
  return `code ${printedCode}`;
}

/** Printed under the counter cards and staff cards. The table tent has none: both its faces face customers. */
export const PRINT_FOOTER = "Print at 100% / Actual size. Cut on the gray lines.";

export function kitFileName(piece: KitPiece, memberSlug: string, staffName: string | null = null): string {
  const parts = ["scan-pass", piece, staffName === null ? "" : staffNameSlug(staffName), memberSlug.trim()];
  return `${parts.filter(Boolean).join("-")}.pdf`;
}
