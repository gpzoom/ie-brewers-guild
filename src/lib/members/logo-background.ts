import { getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";

/**
 * The tile behind a member's logo (members.logo_background). White suits
 * most logos, but a mostly-white logo vanishes on it, so the member picks.
 * Shared by the Basics & hours preview and the public profile, so the
 * preview always shows exactly what visitors will see.
 */
export const LOGO_BACKGROUNDS = ["light", "dark", "theme"] as const;
export type LogoBackground = (typeof LOGO_BACKGROUNDS)[number];

export const LOGO_BACKGROUND_LABELS: Record<LogoBackground, string> = {
  light: "White",
  dark: "Dark",
  theme: "Your theme color",
};

/** Site ink (#241F1A) -- the same dark the profile's status card uses. */
const DARK_TILE = "#241F1A";
const LIGHT_TILE = "#FFFFFF";

export function isLogoBackground(value: unknown): value is LogoBackground {
  return typeof value === "string" && (LOGO_BACKGROUNDS as readonly string[]).includes(value);
}

/** The tile's CSS color. Anything unrecognized falls back to white, the pre-existing look. */
export function logoBackgroundColor(background: string | null | undefined, theme: MemberThemeName): string {
  if (background === "dark") return DARK_TILE;
  if (background === "theme") return getMemberThemeHex(theme);
  return LIGHT_TILE;
}
