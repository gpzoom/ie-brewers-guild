import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/auth/super-admin";

/**
 * Site settings (docs/member-profiles.md, "Super admin" > "Settings"): the
 * super admin's site-wide switches. The first is how often members'
 * calendars are re-synced automatically. No I/O of its own -- clients are
 * passed in, so the cores can be tested with fakes.
 */

/** The choices on the Settings screen, in minutes; 0 turns automatic sync off. */
export const CALENDAR_SYNC_INTERVALS = [0, 15, 30, 60, 180, 360, 720, 1440] as const;
export type CalendarSyncInterval = (typeof CALENDAR_SYNC_INTERVALS)[number];
export const DEFAULT_CALENDAR_SYNC_INTERVAL: CalendarSyncInterval = 15;

export const CALENDAR_SYNC_INTERVAL_LABEL: Record<CalendarSyncInterval, string> = {
  0: "Off (members' Refresh now only)",
  15: "Every 15 minutes",
  30: "Every 30 minutes",
  60: "Every hour",
  180: "Every 3 hours",
  360: "Every 6 hours",
  720: "Every 12 hours",
  1440: "Once a day",
};

export function isCalendarSyncInterval(value: unknown): value is CalendarSyncInterval {
  return (
    typeof value === "number" && (CALENDAR_SYNC_INTERVALS as readonly number[]).includes(value)
  );
}

/**
 * The cron fires every 15 minutes; a run syncs only when the chosen
 * interval has passed since the last run. Two minutes of slack, because a
 * run is recorded a moment after its tick: without it, "every 15 minutes"
 * would find 14:58 elapsed at the next tick and skip to every 30.
 */
const SLACK_MS = 2 * 60 * 1000;

export function isCalendarSyncDue(
  intervalMinutes: number,
  lastRunAt: string | null,
  now: Date,
): boolean {
  if (intervalMinutes <= 0) return false;
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= intervalMinutes * 60 * 1000 - SLACK_MS;
}

export type SiteSettingsView = {
  calendarSyncIntervalMinutes: CalendarSyncInterval;
  calendarSyncLastRunAt: string | null;
  updatedAt: string | null;
};

type SiteSettingsRow = {
  calendar_sync_interval_minutes: number;
  calendar_sync_last_run_at: string | null;
  updated_at: string | null;
};

export function toSiteSettingsView(row: SiteSettingsRow | null): SiteSettingsView {
  const interval = row?.calendar_sync_interval_minutes;
  return {
    calendarSyncIntervalMinutes: isCalendarSyncInterval(interval)
      ? interval
      : DEFAULT_CALENDAR_SYNC_INTERVAL,
    calendarSyncLastRunAt: row?.calendar_sync_last_run_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export const SITE_SETTINGS_COLUMNS =
  "calendar_sync_interval_minutes, calendar_sync_last_run_at, updated_at";

/** Reads the settings as the super admin (the table's select policy allows no one else). */
export async function getSiteSettingsCore(
  sessionClient: SupabaseClient,
): Promise<SiteSettingsView> {
  await requireSuperAdmin(sessionClient, "see the site settings");
  const { data, error } = await sessionClient
    .from("site_settings")
    .select(SITE_SETTINGS_COLUMNS)
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error("Couldn't load the settings — try again.");
  return toSiteSettingsView(data as SiteSettingsRow | null);
}

/**
 * Saves how often calendars re-sync. The super admin check runs first, and
 * the write goes through the session client, so the table's update policy
 * checks for the super admin again.
 */
export async function saveCalendarSyncIntervalCore(
  sessionClient: SupabaseClient,
  intervalMinutes: unknown,
  now: Date,
): Promise<SiteSettingsView> {
  const actor = await requireSuperAdmin(sessionClient, "change the site settings");
  if (!isCalendarSyncInterval(intervalMinutes)) throw new Error("Choose one of the options.");
  const { data, error } = await sessionClient
    .from("site_settings")
    .update({
      calendar_sync_interval_minutes: intervalMinutes,
      updated_at: now.toISOString(),
      updated_by_user_id: actor.userId,
    })
    .eq("id", true)
    .select(SITE_SETTINGS_COLUMNS);
  if (error || !data || data.length === 0)
    throw new Error("Couldn't save the setting — try again.");
  return toSiteSettingsView((data as SiteSettingsRow[])[0]);
}
