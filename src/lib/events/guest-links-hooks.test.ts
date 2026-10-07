import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Every way a stop changes reruns the linker for that member, so a
// taproom's page is never stale for long (the cron is the safety net).
describe("the linker runs after every stop change", () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
  it.each(["createEvent", "updateEvent", "deleteEvent", "setEventOverlay", "clearEventOverlay", "toggleEventHidden"])(
    "events.server.ts: %s",
    (fn) => {
      const s = src("src/lib/events/events.server.ts");
      const start = s.indexOf(`export const ${fn}`);
      expect(start).toBeGreaterThan(-1);
      const next = s.indexOf("\nexport ", start + 1);
      expect(s.slice(start, next === -1 ? undefined : next)).toContain("relinkGuestStops");
    },
  );
  it("calendar sync", () => {
    expect(src("src/lib/events/calendar-connection.server.ts")).toContain("relinkGuestStops");
  });
  it("the 15-minute cron", () => {
    expect(src("src/server.ts")).toContain("relinkGuestStops");
  });
});
