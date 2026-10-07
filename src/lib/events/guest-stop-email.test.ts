import { describe, expect, it } from "vitest";
import type { GuestStopNoticeRow } from "@/lib/supabase/types";
import { buildGuestStopEmail, groupNotices, type EmailVisit } from "./guest-stop-email";

const n = (o: Partial<GuestStopNoticeRow>): GuestStopNoticeRow => ({
  id: "n", host_member_id: "mars", event_id: "e1", kind: "new", guest_name: "Tacos El Gordo", title: null,
  starts_at: "2026-10-03T00:00:00Z", ends_at: "2026-10-03T04:00:00Z", all_day: false, old_starts_at: null, old_ends_at: null,
  created_at: "2026-10-01T00:00:00Z", claimed_at: null, sent_at: null, attempts: 0, last_error: null, ...o,
});
const visit = (o: Partial<GuestStopNoticeRow>, buttons: EmailVisit["buttons"] = []): EmailVisit => ({ ...n(o), buttons });
const base = { taproomName: "Bob's Brewery", street: "9373 Coca Street", timezone: "America/Los_Angeles", pageUrl: "https://x/members/bob", eventsUrl: "https://x/portal/events", staging: false };

describe("groupNotices", () => {
  it("per taproom; changed then canceled in one run: only the canceled", () => {
    const g = groupNotices([
      n({ id: "1", kind: "changed", created_at: "2026-10-01T00:00:00Z" }),
      n({ id: "2", kind: "canceled", created_at: "2026-10-01T00:05:00Z" }),
      n({ id: "3", host_member_id: "sample", event_id: "e2", kind: "new" }),
    ]);
    expect(g.get("mars")?.map((x) => x.kind)).toEqual(["canceled"]);
    expect(g.get("sample")?.map((x) => x.kind)).toEqual(["new"]);
  });
  it("new then changed in one run: one 'new' at the latest time", () => {
    const g = groupNotices([n({ id: "1", kind: "new" }), n({ id: "2", kind: "changed", starts_at: "2026-10-04T00:00:00Z", created_at: "2026-10-01T00:05:00Z" })]);
    expect(g.get("mars")).toEqual([expect.objectContaining({ kind: "new", starts_at: "2026-10-04T00:00:00Z" })]);
  });
  it("two changes: earliest old time, latest new time", () => {
    const g = groupNotices([
      n({ id: "1", kind: "changed", old_starts_at: "2026-10-02T00:00:00Z", starts_at: "2026-10-03T00:00:00Z" }),
      n({ id: "2", kind: "changed", old_starts_at: "2026-10-03T00:00:00Z", starts_at: "2026-10-05T00:00:00Z", created_at: "2026-10-01T00:05:00Z" }),
    ]);
    expect(g.get("mars")).toEqual([expect.objectContaining({ old_starts_at: "2026-10-02T00:00:00Z", starts_at: "2026-10-05T00:00:00Z" })]);
  });
});

describe("buildGuestStopEmail", () => {
  it("one new visit (GV2 #1)", () => {
    const e = buildGuestStopEmail({ ...base, visits: [visit({}, [{ label: "Hide this visit", href: "https://x/visit/t1" }])] });
    expect(e.subject).toBe("Tacos El Gordo is coming to Bob's Brewery · Fri, Oct 2");
    expect(e.text).toContain("Tacos El Gordo, a Guild member, listed a stop at your taproom:");
    expect(e.text).toContain("Friday, October 2 · 5:00 – 9:00 pm");
    expect(e.text).toContain("Bob's Brewery · 9373 Coca Street");
    expect(e.text).toContain("It's on your page now.");
    expect(e.html).toContain('href="https://x/visit/t1"');
    expect(e.html).toContain("Hide this visit");
    expect(e.html).toContain("See your page");
  });
  it("a request (GV2 #2)", () => {
    const e = buildGuestStopEmail({ ...base, visits: [visit({ kind: "request", guest_name: "Rolling Smoke BBQ" })] });
    expect(e.subject).toBe("Approve a visit? Rolling Smoke BBQ · Fri, Oct 2");
    expect(e.text).toContain("would like to be listed at your taproom:");
    expect(e.text).toContain("Nothing shows on your page until you approve.");
  });
  it("changed (GV2 #3) and canceled", () => {
    const c = buildGuestStopEmail({ ...base, visits: [visit({ kind: "changed", old_starts_at: "2026-10-03T00:00:00Z", old_ends_at: "2026-10-03T04:00:00Z", starts_at: "2026-10-04T00:00:00Z", ends_at: "2026-10-04T04:00:00Z" })] });
    expect(c.subject).toBe("Changed: Tacos El Gordo moved to Sat, Oct 3");
    expect(c.text).toContain("Friday, October 2 · 5:00 – 9:00 pm → Saturday, October 3 · 5:00 – 9:00 pm");
    expect(c.text).toContain("Your page already shows the new date.");
    const x = buildGuestStopEmail({ ...base, visits: [visit({ kind: "canceled" })] });
    expect(x.subject).toBe("Canceled: Tacos El Gordo · Fri, Oct 2");
    expect(x.text).toContain("It's off your page.");
  });
  it("several visits: one summary email", () => {
    const e = buildGuestStopEmail({ ...base, visits: [visit({}), visit({ id: "2", event_id: "e2", starts_at: "2026-10-05T00:00:00Z" })] });
    expect(e.subject).toBe("2 Guild member visits at Bob's Brewery");
    const r = buildGuestStopEmail({ ...base, visits: [visit({ kind: "request" }), visit({ id: "2", event_id: "e2", kind: "request" })] });
    expect(r.subject).toBe("2 visits to approve at Bob's Brewery");
  });
  it("the visit's own title follows the name; text is escaped in HTML; footer; staging marker", () => {
    const e = buildGuestStopEmail({ ...base, staging: true, visits: [visit({ title: "<Taco> Tuesday" })] });
    expect(e.text).toContain("Tacos El Gordo — <Taco> Tuesday");
    expect(e.html).toContain("&lt;Taco&gt; Tuesday");
    expect(e.text).toContain("You get this because you're an owner or editor of Bob's Brewery on the ISC Brewers Guild site.");
    expect(e.subject.startsWith("[Staging] ")).toBe(true);
  });
});
