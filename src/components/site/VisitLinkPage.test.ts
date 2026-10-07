import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisitLinkCard } from "./VisitLinkPage";

const ready = {
  state: "ready" as const, action: "approve" as const, status: "pending" as const, guestName: "Rolling Smoke BBQ", title: null,
  startsAt: "2026-10-03T00:00:00Z", endsAt: "2026-10-03T04:00:00Z", allDay: false, taproomName: "Bob's Brewery", timezone: "America/Los_Angeles",
};
const render = (o: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(VisitLinkCard, { view: ready, done: false, busy: false, error: null, onConfirm: () => {}, ...o } as never));

describe("VisitLinkCard", () => {
  it("ready: the visit and one button; nothing done yet", () => {
    const html = render({});
    expect(html).toContain("Rolling Smoke BBQ");
    expect(html).toContain("Friday, October 2");
    expect(html).toContain("Bob&#x27;s Brewery");
    expect(html).toContain(">Approve this visit<");
    expect(html).toContain("Nothing shows on your page until you approve.");
  });
  it("done: what happened and the Events page link", () => {
    const html = render({ done: true });
    expect(html).toContain("Approved. It&#x27;s on your page now.");
    expect(html).toContain("Changed your mind? Your Events page has every visit.");
    expect(html).toContain('href="/portal/events"');
  });
  it("decline and hide buttons", () => {
    expect(render({ view: { ...ready, action: "decline" } })).toContain(">Decline this visit<");
    expect(render({ view: { ...ready, action: "hide", status: "shown" } })).toContain(">Hide it from my page<");
  });
  it("answered and gone", () => {
    expect(render({ view: { ...ready, state: "answered", status: "shown" } })).toContain("This visit is already on your page.");
    expect(render({ view: { state: "gone" } })).toContain("This visit is no longer at your taproom.");
    expect(render({ view: { state: "invalid" } })).toContain("This link isn");
  });
});
