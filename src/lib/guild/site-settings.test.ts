import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCalendarSyncDue,
  saveCalendarSyncIntervalCore,
  getSiteSettingsCore,
  saveCarouselDwellCore,
  setHeroImageCore,
  toSiteSettingsView,
} from "./site-settings";
import { claimScheduledCalendarSync } from "@/lib/events/calendar-sync-schedule";

const now = new Date("2026-09-27T20:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();

describe("isCalendarSyncDue", () => {
  it("runs on the first tick, and never when automatic sync is off", () => {
    expect(isCalendarSyncDue(15, null, now)).toBe(true);
    expect(isCalendarSyncDue(0, null, now)).toBe(false);
    expect(isCalendarSyncDue(0, minutesAgo(9999), now)).toBe(false);
  });

  it("every 15 minutes still runs on the next tick when the last run was recorded a few seconds late", () => {
    expect(isCalendarSyncDue(15, minutesAgo(14.9), now)).toBe(true);
    expect(isCalendarSyncDue(15, minutesAgo(5), now)).toBe(false);
  });

  it("every hour waits for the hour", () => {
    expect(isCalendarSyncDue(60, minutesAgo(45), now)).toBe(false);
    expect(isCalendarSyncDue(60, minutesAgo(59), now)).toBe(true);
  });
});

describe("toSiteSettingsView", () => {
  it("falls back to every 15 minutes for a missing row or an unknown value", () => {
    expect(toSiteSettingsView(null).calendarSyncIntervalMinutes).toBe(15);
    expect(
      toSiteSettingsView({
        calendar_sync_interval_minutes: 7,
        calendar_sync_last_run_at: null,
        updated_at: null,
      }).calendarSyncIntervalMinutes,
    ).toBe(15);
  });
});

function fakeSession(isSuperAdmin: boolean) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "me@example.com" } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { is_guild_admin: true, is_super_admin: isSuperAdmin },
                error: null,
              }),
            }),
          }),
        };
      }
      expect(table).toBe("site_settings");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                calendar_sync_interval_minutes: 60,
                calendar_sync_last_run_at: null,
                carousel_dwell_seconds: 6,
                hero_image_path: "hero/old-photo.jpg",
                updated_at: null,
              },
              error: null,
            }),
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: () => ({
            select: async () => {
              updates.push(values);
              return {
                data: [
                  {
                    calendar_sync_interval_minutes: values.calendar_sync_interval_minutes ?? 60,
                    calendar_sync_last_run_at: null,
                    carousel_dwell_seconds: values.carousel_dwell_seconds ?? 6,
                    hero_image_path:
                      "hero_image_path" in values ? values.hero_image_path : "hero/old-photo.jpg",
                    updated_at: values.updated_at,
                  },
                ],
                error: null,
              };
            },
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

describe("Settings: super admin only", () => {
  it("a Guild admin can't read or change the settings, and nothing is written", async () => {
    const session = fakeSession(false);
    await expect(getSiteSettingsCore(session.client)).rejects.toThrow(
      "Only the super admin can see the site settings.",
    );
    await expect(saveCalendarSyncIntervalCore(session.client, 60, now)).rejects.toThrow(
      "Only the super admin can change the site settings.",
    );
    expect(session.updates).toEqual([]);
  });

  it("the super admin saves one of the offered intervals", async () => {
    const session = fakeSession(true);
    const saved = await saveCalendarSyncIntervalCore(session.client, 180, now);
    expect(saved.calendarSyncIntervalMinutes).toBe(180);
    expect(session.updates).toEqual([
      {
        calendar_sync_interval_minutes: 180,
        updated_at: "2026-09-27T20:00:00.000Z",
        updated_by_user_id: "user-1",
      },
    ]);
  });

  it("refuses an interval that isn't offered", async () => {
    const session = fakeSession(true);
    await expect(saveCalendarSyncIntervalCore(session.client, 5, now)).rejects.toThrow(
      "Choose one of the options.",
    );
    expect(session.updates).toEqual([]);
  });

  it("reads the settings for the super admin", async () => {
    const settings = await getSiteSettingsCore(fakeSession(true).client);
    expect(settings.calendarSyncIntervalMinutes).toBe(60);
  });
});

describe("Homepage settings", () => {
  it("defaults to 6 seconds and the built-in hero for a missing row or bad values", () => {
    expect(toSiteSettingsView(null)).toMatchObject({ carouselDwellSeconds: 6, heroImagePath: null });
    expect(
      toSiteSettingsView({
        calendar_sync_interval_minutes: 15,
        calendar_sync_last_run_at: null,
        carousel_dwell_seconds: 7,
        hero_image_path: "../member-media/x.jpg",
        updated_at: null,
      }),
    ).toMatchObject({ carouselDwellSeconds: 6, heroImagePath: null });
  });

  it("the super admin saves an offered dwell time; anything else is refused", async () => {
    const session = fakeSession(true);
    const saved = await saveCarouselDwellCore(session.client, 10, now);
    expect(saved.carouselDwellSeconds).toBe(10);
    expect(session.updates[0]).toMatchObject({ carousel_dwell_seconds: 10, updated_by_user_id: "user-1" });
    await expect(saveCarouselDwellCore(session.client, 5, now)).rejects.toThrow(
      "Choose one of the options.",
    );
    expect(session.updates).toHaveLength(1);
  });

  it("a Guild admin can't change the dwell time or the hero", async () => {
    const session = fakeSession(false);
    await expect(saveCarouselDwellCore(session.client, 8, now)).rejects.toThrow(
      "Only the super admin",
    );
    await expect(setHeroImageCore(session.client, "hero/new.jpg", now)).rejects.toThrow(
      "Only the super admin",
    );
    expect(session.updates).toEqual([]);
  });

  it("sets a new hero and reports the one it replaced; null goes back to the built-in image", async () => {
    const session = fakeSession(true);
    const result = await setHeroImageCore(session.client, "hero/new-photo.jpg", now);
    expect(result.settings.heroImagePath).toBe("hero/new-photo.jpg");
    expect(result.previousPath).toBe("hero/old-photo.jpg");
    const cleared = await setHeroImageCore(session.client, null, now);
    expect(cleared.settings.heroImagePath).toBeNull();
  });

  it("refuses a path outside hero/", async () => {
    const session = fakeSession(true);
    await expect(setHeroImageCore(session.client, "member-media/x.jpg", now)).rejects.toThrow(
      "That isn't a hero image.",
    );
    expect(session.updates).toEqual([]);
  });
});

function fakeService(settings: { interval: number; lastRunAt: string | null }, claimRows: number) {
  const claimFilters: Array<[string, unknown]> = [];
  const update = vi.fn();
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              calendar_sync_interval_minutes: settings.interval,
              calendar_sync_last_run_at: settings.lastRunAt,
            },
            error: null,
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        update(values);
        const chain = {
          eq: (column: string, value: unknown) => {
            if (column !== "id") claimFilters.push([column, value]);
            return chain;
          },
          is: (column: string, value: unknown) => {
            claimFilters.push([column, value]);
            return chain;
          },
          select: async () => ({
            data: Array.from({ length: claimRows }, () => ({ id: true })),
            error: null,
          }),
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, update, claimFilters };
}

describe("claimScheduledCalendarSync", () => {
  it("claims a due run, only if nobody else recorded one since", async () => {
    const last = minutesAgo(16);
    const service = fakeService({ interval: 15, lastRunAt: last }, 1);
    expect(await claimScheduledCalendarSync(service.client, now)).toBe(true);
    expect(service.update).toHaveBeenCalledWith({ calendar_sync_last_run_at: now.toISOString() });
    expect(service.claimFilters).toEqual([["calendar_sync_last_run_at", last]]);
  });

  it("stands down when the other Worker claimed the same tick", async () => {
    const service = fakeService({ interval: 15, lastRunAt: minutesAgo(16) }, 0);
    expect(await claimScheduledCalendarSync(service.client, now)).toBe(false);
  });

  it("does nothing when it isn't due, or automatic sync is off", async () => {
    const notDue = fakeService({ interval: 60, lastRunAt: minutesAgo(20) }, 1);
    expect(await claimScheduledCalendarSync(notDue.client, now)).toBe(false);
    expect(notDue.update).not.toHaveBeenCalled();

    const off = fakeService({ interval: 0, lastRunAt: null }, 1);
    expect(await claimScheduledCalendarSync(off.client, now)).toBe(false);
    expect(off.update).not.toHaveBeenCalled();
  });

  it("claims the very first run", async () => {
    const service = fakeService({ interval: 15, lastRunAt: null }, 1);
    expect(await claimScheduledCalendarSync(service.client, now)).toBe(true);
    expect(service.claimFilters).toEqual([["calendar_sync_last_run_at", null]]);
  });
});
