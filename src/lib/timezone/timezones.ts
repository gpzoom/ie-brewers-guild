/**
 * Real IANA timezone list, sourced from the JS engine's own tz database via
 * Intl.supportedValuesOf -- never hardcode a static list, since the set of
 * valid IANA zone names changes over time. Standard ECMA-402, available
 * identically in the Cloudflare Workers runtime, Node, and every browser
 * this admin panel targets.
 */
export function listIanaTimezones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

export function isValidIanaTimezone(value: string): boolean {
  return listIanaTimezones().includes(value);
}
