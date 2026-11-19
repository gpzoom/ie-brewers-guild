/**
 * Maintenance mode (owner, 2026-11-14): while testing needs the Sample
 * members published, the public sees src/components/site/MaintenanceMode.tsx
 * instead of the site. Staging and live share one database, so the switch
 * (site_settings.maintenance_mode, Guild Settings) covers both sites.
 */

/** Paths that keep working: sign-in, the portal and Guild screens, and links in emails. */
const OPEN_PREFIXES = [
  "/signin",
  "/portal",
  "/admin",
  "/guild",
  "/auth",
  "/send",
  "/visit",
  "/unsubscribe",
  "/api",
  "/maintenance",
  // The Terms of Use and Privacy Policy are always readable.
  "/terms",
  "/privacy",
  // Join the Guild, step 2: a signed-in applicant's page, reached from the
  // emailed link (the public /join form itself stays closed).
  "/join/finish",
  // Inland Tap Card: bars keep checking cards in, and customers keep their own
  // card pages, during maintenance. The public /trail page stays closed.
  "/p",
  "/t",
  "/s",
  "/scanner",
  "/card",
  // Joining the Beer Trail from a plate, and coming back from Zeffy.
  "/trail/join",
  "/trail/joined",
];

export function showsMaintenance(
  pathname: string,
  state: { on: boolean; isGuildAdmin: boolean },
): boolean {
  if (!state.on || state.isGuildAdmin) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return !OPEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
