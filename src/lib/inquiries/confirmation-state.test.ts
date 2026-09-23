import { describe, expect, it } from "vitest";
import { resolveConfirmationDisplayState } from "./confirmation-state";

const NOW = new Date("2026-09-21T16:12:00Z").getTime();

describe("resolveConfirmationDisplayState", () => {
  it("is sent when confirmation_sent_at is set, regardless of age", () => {
    expect(
      resolveConfirmationDisplayState({
        confirmationSentAt: "2026-09-21T16:12:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        now: NOW,
      }),
    ).toBe("sent");
  });

  it("is not_yet_sent when confirmation_sent_at is null and the inquiry is brand new", () => {
    expect(
      resolveConfirmationDisplayState({
        confirmationSentAt: null,
        createdAt: new Date(NOW - 30_000).toISOString(),
        now: NOW,
      }),
    ).toBe("not_yet_sent");
  });

  it("is failed_to_send when confirmation_sent_at is null and the grace period has elapsed", () => {
    expect(
      resolveConfirmationDisplayState({
        confirmationSentAt: null,
        createdAt: new Date(NOW - 6 * 60 * 1000).toISOString(),
        now: NOW,
      }),
    ).toBe("failed_to_send");
  });
});
