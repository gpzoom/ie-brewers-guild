import type { MemberType } from "@/lib/supabase/types";

/**
 * The default social-sharing image for a member who hasn't set one of
 * their own. Static files under public/og/ (not src/assets/) so they're
 * served at a fixed path without going through Vite's asset-hashing
 * pipeline -- member-profile.server.ts's getMemberProfileData handler
 * runs only in the server bundle, and a plain string path here sidesteps
 * any question of whether an `import` of a static asset resolves the same
 * way there as it does in client-rendered route files (the only place
 * this codebase has used that pattern so far).
 */
const OG_PLACEHOLDER_PATH_BY_TYPE: Record<MemberType, string> = {
  producer: "/og/producer.png",
  mobile: "/og/mobile.png",
  allied: "/og/allied.png",
};

export function getOgPlaceholderPath(memberType: MemberType): string {
  return OG_PLACEHOLDER_PATH_BY_TYPE[memberType];
}
