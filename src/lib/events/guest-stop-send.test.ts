import { describe, expect, it } from "vitest";
import { siteRole, visitButtons } from "./guest-stop-send";
import { verifyVisitLink } from "./visit-link-token";

const NOW = new Date("2026-10-07T18:00:00Z");
const v = (kind: "new" | "request" | "changed" | "canceled") => ({
  id: "n", host_member_id: "mars", event_id: "e1", kind, guest_name: "T", title: null,
  starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false, old_starts_at: null, old_ends_at: null,
  created_at: "", claimed_at: null, sent_at: null, attempts: 0, last_error: null,
});

describe("siteRole", () => {
  it("staging by its own origin; anything else is the live site", () => {
    expect(siteRole("https://ie-brewers-guild-staging.boblelle77.workers.dev")).toEqual({ origin: "https://ie-brewers-guild-staging.boblelle77.workers.dev", staging: true });
    expect(siteRole("https://iscbrewersguild.org")).toEqual({ origin: "https://iscbrewersguild.org", staging: false });
    expect(siteRole(undefined)).toEqual({ origin: "https://iscbrewersguild.org", staging: false });
  });
});

describe("visitButtons", () => {
  const ctx = { origin: "https://x", secret: "k", now: NOW };
  it("shown: Hide; request: Approve and Decline; canceled: none; changed while pending: Approve and Decline", async () => {
    expect((await visitButtons(v("new"), "shown", ctx)).map((b) => b.label)).toEqual(["Hide this visit"]);
    expect((await visitButtons(v("request"), "pending", ctx)).map((b) => b.label)).toEqual(["Approve", "Decline"]);
    expect(await visitButtons(v("canceled"), "shown", ctx)).toEqual([]);
    expect((await visitButtons(v("changed"), "pending", ctx)).map((b) => b.label)).toEqual(["Approve", "Decline"]);
  });
  it("each button's link is a signed /visit/ link for that action", async () => {
    const [approve] = await visitButtons(v("request"), "pending", ctx);
    const token = approve.href.replace("https://x/visit/", "");
    expect(await verifyVisitLink(token, "k", NOW)).toEqual({ valid: true, eventId: "e1", hostId: "mars", action: "approve" });
  });
});
