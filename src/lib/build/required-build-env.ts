/**
 * Browser-side settings that `vite build` bakes into the client bundle from
 * `.env` (or the shell environment) on whichever computer runs the deploy.
 * The Worker's own Cloudflare variables never reach the browser, so a build
 * without these ships a site with a blank Maps key and no Supabase client --
 * which is exactly what a laptop deploy with no `.env` did on 2026-11-02.
 *
 * VITE_WEB3FORMS_KEY is left out on purpose: only the hidden /survey page
 * uses it. VITE_UNDER_CONSTRUCTION is a switch, not a key; unset means off.
 */
export const REQUIRED_BUILD_ENV = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_GOOGLE_MAPS_API_KEY",
] as const;

/** Names from REQUIRED_BUILD_ENV that are missing or blank in `env`. */
export function missingBuildEnv(env: Record<string, string | undefined>): string[] {
  return REQUIRED_BUILD_ENV.filter((name) => !env[name]?.trim());
}

/** The error a build stops with when settings are missing. */
export function missingBuildEnvMessage(missing: string[], mode: string): string {
  return [
    `Build stopped: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set (mode "${mode}").`,
    "These are baked into the browser bundle from .env on this computer, so the",
    "site would go out with a broken map and no sign-in. Copy .env.example to .env",
    "and fill them in (staging's values are the same), then build again.",
  ].join("\n");
}
