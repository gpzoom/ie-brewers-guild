import { describe, expect, it, vi } from "vitest";
import type { MemberNotificationRow } from "@/lib/supabase/types";
import { runLaunchSummary, runLaunchSummaryIf, type LaunchRunDeps } from "./launch-run";

const rows = [{ id: "r1" }] as MemberNotificationRow[];
const deps = (o: Partial<LaunchRunDeps> = {}): LaunchRunDeps => ({
  loadSettings: vi.fn(async () => ({ emails_enabled: false, launch_summary_sent_at: null })),
  loadQuietOpen: vi.fn(async () => rows),
  claim: vi.fn(async () => true),
  release: vi.fn(async () => {}),
  send: vi.fn(async () => {}),
  ...o,
});

describe("runLaunchSummary", () => {
  it("claims then sends", async () => {
    const d = deps();
    await runLaunchSummary(d);
    expect(d.claim).toHaveBeenCalled();
    expect(d.send).toHaveBeenCalledWith(rows);
    expect(d.release).not.toHaveBeenCalled();
  });
  it("claim returns no row: no send", async () => {
    const d = deps({ claim: vi.fn(async () => false) });
    await runLaunchSummary(d);
    expect(d.send).not.toHaveBeenCalled();
  });
  it("send fails: claim released, error surfaces", async () => {
    const d = deps({
      send: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(runLaunchSummary(d)).rejects.toThrow("boom");
    expect(d.release).toHaveBeenCalledTimes(1);
  });
  it("zero quiet rows: no claim, no send", async () => {
    const d = deps({ loadQuietOpen: vi.fn(async () => []) });
    await runLaunchSummary(d);
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });
  it("already sent or emails on: nothing", async () => {
    for (const s of [
      { emails_enabled: true, launch_summary_sent_at: null },
      { emails_enabled: false, launch_summary_sent_at: "2026-11-16T00:00:00Z" },
    ]) {
      const d = deps({ loadSettings: vi.fn(async () => s) });
      await runLaunchSummary(d);
      expect(d.claim).not.toHaveBeenCalled();
    }
  });
});

describe("runLaunchSummaryIf", () => {
  it("refresh false: not called; true: called", async () => {
    const run = vi.fn(async () => {});
    await runLaunchSummaryIf(false, run);
    expect(run).not.toHaveBeenCalled();
    await runLaunchSummaryIf(true, run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
