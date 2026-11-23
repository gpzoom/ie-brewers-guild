import { describe, expect, it, vi } from "vitest";
import { joinTrailCore, type TrailOptInStore } from "./trail-opt-in";

function store(over: Partial<{ producer: boolean; onTrail: boolean; published: boolean }> = {}, added = true) {
  return {
    find: vi.fn(async (_memberId: string) => ({ producer: true, onTrail: false, published: true, businessName: "Sample Brewery", city: "Riverside", ...over })),
    addToTrail: vi.fn(async (_memberId: string) => added),
    notifyGuild: vi.fn(async (_p: Parameters<TrailOptInStore["notifyGuild"]>[0]) => {}),
  } satisfies TrailOptInStore;
}

describe("joinTrailCore", () => {
  it("adds the member and tells the Guild once", async () => {
    const s = store();
    await expect(joinTrailCore(s, "m1")).resolves.toEqual({ producer: true, onTrail: true, published: true });
    expect(s.addToTrail).toHaveBeenCalledWith("m1");
    expect(s.notifyGuild).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and emails no one, when already on the trail", async () => {
    const s = store({ onTrail: true });
    await joinTrailCore(s, "m1");
    expect(s.addToTrail).not.toHaveBeenCalled();
    expect(s.notifyGuild).not.toHaveBeenCalled();
  });

  it("a double click sends one email: the second save changes nothing", async () => {
    const s = store({}, false);
    await joinTrailCore(s, "m1");
    expect(s.notifyGuild).not.toHaveBeenCalled();
  });

  it("refuses a member that isn't a taproom", async () => {
    const s = store({ producer: false });
    await expect(joinTrailCore(s, "m1")).rejects.toThrow(/Only taproom members/);
    expect(s.addToTrail).not.toHaveBeenCalled();
  });

  it("still succeeds when the Guild email fails", async () => {
    const s = store();
    s.notifyGuild.mockRejectedValueOnce(new Error("Resend down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    await expect(joinTrailCore(s, "m1")).resolves.toMatchObject({ onTrail: true });
  });
});
