/**
 * The card page's own buttons: Scan (an in-page camera that reads the Tap
 * Card's own QR codes) and Save to Home Screen.
 */

const PLATE_PATH = /^\/t\/[0-9A-HJKMNP-TV-Z]{8}$/;
const STAFF_QR_PATH = /^\/s\/[0-9A-HJKMNP-TV-Z]{8}$/;

/**
 * The page a scanned code should open -- only a counter plate or a
 * staff QR code, and always on this site (the host is dropped).
 */
export function scannedTapCardPath(text: string): string | null {
  let path: string;
  try {
    path = text.startsWith("/") ? text : new URL(text).pathname;
  } catch {
    return null;
  }
  return PLATE_PATH.test(path) || STAFF_QR_PATH.test(path) ? path : null;
}

/** The staff code in a scanned staff QR's path, or null for anything else. */
export function staffQrTokenFrom(path: string): string | null {
  return STAFF_QR_PATH.test(path) ? path.slice(3) : null;
}

export type HomeScreenKind = "hidden" | "prompt" | "iphone" | "menu";

export function homeScreenKind(i: { userAgent: string; standalone: boolean; canPrompt: boolean }): HomeScreenKind {
  if (i.standalone) return "hidden";
  if (i.canPrompt) return "prompt";
  return /iPhone|iPad|iPod/.test(i.userAgent) ? "iphone" : "menu";
}

/** On /card and /card/signin: what a phone reads when the card is saved to the Home Screen. */
export const CARD_APP_HEAD_LINKS = [
  { rel: "manifest", href: "/tap-card/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/tap-card/apple-touch-icon.png" },
];
export const CARD_APP_HEAD_META = [
  { name: "apple-mobile-web-app-title", content: "Scan Pass" },
  { name: "theme-color", content: "#000000" },
];

/** The buttons under the success screen. No Sign out here, on purpose (owner, 2026-11-18). */
export function successLinks(m: { memberName: string; memberSlug: string }): { label: string; href: string }[] {
  return [
    { label: "Go to my account", href: "/card" },
    { label: `Go to ${m.memberName}'s profile`, href: `/members/${encodeURIComponent(m.memberSlug)}` },
    { label: "Go to the homepage", href: "/" },
  ];
}
