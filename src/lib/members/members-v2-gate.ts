/**
 * /members-2 is a staging trial (spec "Goal"): it 404s on the live site's
 * hostnames, so merging staging into main can't put it in front of the
 * public. Remove this gate only when the owner decides v2 replaces /members.
 */
const PRODUCTION_HOSTS = new Set(["iscbrewersguild.org", "www.iscbrewersguild.org"]);

export function isMembersV2Host(url: string): boolean {
  try {
    return !PRODUCTION_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
