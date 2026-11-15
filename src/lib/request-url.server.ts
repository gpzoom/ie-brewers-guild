import { getRequest } from "@tanstack/react-start/server";

/**
 * The in-flight request's URL, so email links point back at the site that
 * sent them (see resolveEmailSiteUrl): a staging request links to staging.
 * A cron run has no request, and getRequest() throws outside one -- null
 * then means "use SITE_URL".
 */
export function currentRequestUrl(): string | null {
  try {
    return getRequest().url;
  } catch {
    return null;
  }
}
