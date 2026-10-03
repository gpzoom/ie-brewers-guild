import { describe, expect, it } from "vitest";
import { hasAlreadyBeenNotifiedForCurrentStalenessEpisode } from "./hours-stale-cron";

describe("hasAlreadyBeenNotifiedForCurrentStalenessEpisode", () => {
  it("returns false (should notify) when never notified before", () => {
    expect(hasAlreadyBeenNotifiedForCurrentStalenessEpisode(null, "2026-01-01T00:00:00.000Z")).toBe(false);
  });

  it("returns false (should notify) when notified before the current confirmation -- re-confirming re-arms the notice", () => {
    const sentAt = "2025-11-01T00:00:00.000Z";
    const confirmedAt = "2026-01-01T00:00:00.000Z"; // re-confirmed after the last notice
    expect(hasAlreadyBeenNotifiedForCurrentStalenessEpisode(sentAt, confirmedAt)).toBe(false);
  });

  it("returns true (should NOT notify) when notified after the current confirmation -- already handled this episode", () => {
    const confirmedAt = "2026-01-01T00:00:00.000Z";
    const sentAt = "2026-01-02T00:00:00.000Z"; // notice already sent since the last confirmation
    expect(hasAlreadyBeenNotifiedForCurrentStalenessEpisode(sentAt, confirmedAt)).toBe(true);
  });

  it("returns true (should NOT notify) when notified at the exact same instant as the confirmation -- ties favor not double-sending", () => {
    const timestamp = "2026-01-01T00:00:00.000Z";
    expect(hasAlreadyBeenNotifiedForCurrentStalenessEpisode(timestamp, timestamp)).toBe(true);
  });

  it("returns false (should notify) when both timestamps are null", () => {
    expect(hasAlreadyBeenNotifiedForCurrentStalenessEpisode(null, null)).toBe(false);
  });

  it("returns false (should notify) when notified before but confirmedAt is null (defensive -- shouldn't occur given the caller's own query filter)", () => {
    expect(hasAlreadyBeenNotifiedForCurrentStalenessEpisode("2026-01-01T00:00:00.000Z", null)).toBe(false);
  });
});
