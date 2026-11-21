/**
 * What the print-kit renderers need. Deliberately no field for the 4-digit
 * staff code: it is never printed (owner, 2026-11-21).
 */
export type PrintKitInput = {
  memberName: string;
  memberSlug: string;
  trailStop: boolean;
  /** From logoBackgroundColor(members.logo_background, members.theme), a #RRGGBB hex. */
  logoTileColor: string;
  plateUrl: string;
  printedCode: string;
  staffQrUrl: string;
  staffQrPrinted: string;
};

export type KitFontBytes = { heading: Uint8Array; body: Uint8Array; bodySemi: Uint8Array };

/** PNG bytes; null when there is no logo or it couldn't be loaded. */
export type KitImageBytes = { guildLogoPng: Uint8Array | null; memberLogoPng: Uint8Array | null };
