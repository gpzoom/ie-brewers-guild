/**
 * The 8 member profile themes (spec, "Profile hero and theme"). This is
 * the single source of truth for the theme table -- the Member Admin
 * phase's theme picker (artboard K) must import from this file rather
 * than redefining the table, per this plan's own Decisions section.
 *
 * Member themes are a separate system from the Guild's own brand tokens
 * (src/styles.css's --brand/--brand-bright/etc.) -- a member theme colors
 * only what sits inside the Guild's dark frame on that member's own page.
 */
export type MemberThemeName =
  | "amber"
  | "rust"
  | "garnet"
  | "plum"
  | "indigo"
  | "teal"
  | "forest"
  | "olive";

export type MemberTheme = {
  name: MemberThemeName;
  label: string;
  hex: string;
};

export const MEMBER_THEMES: MemberTheme[] = [
  { name: "amber", label: "Amber", hex: "#B45309" },
  { name: "rust", label: "Rust", hex: "#9A3412" },
  { name: "garnet", label: "Garnet", hex: "#9B2242" },
  { name: "plum", label: "Plum", hex: "#6B2D6B" },
  { name: "indigo", label: "Indigo", hex: "#3B4B9A" },
  { name: "teal", label: "Teal", hex: "#17605F" },
  { name: "forest", label: "Forest", hex: "#2F6B33" },
  { name: "olive", label: "Olive", hex: "#55621C" },
];

export const DEFAULT_MEMBER_THEME: MemberThemeName = "amber";

export function getMemberThemeHex(name: MemberThemeName): string {
  return MEMBER_THEMES.find((theme) => theme.name === name)?.hex ?? MEMBER_THEMES[0].hex;
}
