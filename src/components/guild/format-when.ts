/** "Nov 12, 2026, 3:04 PM" in the Guild's time (Pacific): the Audit log's and Recent broadcasts' timestamps. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}
