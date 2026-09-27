import { useState, type FormEvent } from "react";
import { saveCalendarSyncInterval } from "@/lib/guild/site-settings.server";
import {
  CALENDAR_SYNC_INTERVALS,
  CALENDAR_SYNC_INTERVAL_LABEL,
  type CalendarSyncInterval,
  type SiteSettingsView,
} from "@/lib/guild/site-settings";

const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 font-sans text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const darkButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas transition-colors hover:bg-ink/85 disabled:opacity-60";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

/** When the next automatic check should run, to the nearest 15-minute tick. */
function nextCheck(settings: SiteSettingsView): string | null {
  const interval = settings.calendarSyncIntervalMinutes;
  if (interval === 0) return null;
  if (!settings.calendarSyncLastRunAt) return "within 15 minutes";
  const due = Date.parse(settings.calendarSyncLastRunAt) + interval * 60 * 1000;
  return due <= Date.now()
    ? "within 15 minutes"
    : `around ${formatWhen(new Date(due).toISOString())}`;
}

/**
 * The super admin's Settings (docs/member-profiles.md, "Super admin" >
 * "Settings"; artboard Z). For now one setting: how often members'
 * calendars are re-synced automatically. Times are the Guild's (Pacific).
 */
export function SiteSettingsScreen({ initial }: { initial: SiteSettingsView }) {
  const [settings, setSettings] = useState(initial);
  const [choice, setChoice] = useState<CalendarSyncInterval>(initial.calendarSyncIntervalMinutes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveCalendarSyncInterval({ data: { intervalMinutes: choice } });
      setSettings(saved);
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Couldn't save the setting — try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const next = nextCheck(settings);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[640px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          Settings
        </h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          Site-wide settings. Only you, the super admin, see this page.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex max-w-[640px] flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-semibold text-ink">Calendar sync</h2>
          <p className="text-pretty text-[13px] leading-[1.5] text-ink-muted">
            How often the site checks every member's connected calendar for new, changed or removed
            events. Members can still press Refresh now on their Events page at any time.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Check members' calendars</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={choice}
              disabled={saving}
              onChange={(e) => {
                setChoice(Number(e.target.value) as CalendarSyncInterval);
                setMessage(null);
              }}
              className={fieldClass}
            >
              {CALENDAR_SYNC_INTERVALS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {CALENDAR_SYNC_INTERVAL_LABEL[minutes]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving || choice === settings.calendarSyncIntervalMinutes}
              className={darkButtonClass}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </label>

        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={
              message.kind === "error" ? "text-[13px] text-danger" : "text-[13px] text-ink-muted"
            }
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-col gap-0.5 border-t border-canvas-2 pt-3 text-[12px] text-ink-muted">
          <span>
            Last automatic check:{" "}
            {settings.calendarSyncLastRunAt
              ? formatWhen(settings.calendarSyncLastRunAt)
              : "not yet"}
          </span>
          <span>{next ? `Next: ${next}` : "Automatic checks are off."}</span>
          <span className="pt-1">
            Google updates a calendar's link only every few hours, so a new event can take a while
            to show up however often the site checks.
          </span>
        </div>
      </form>
    </div>
  );
}
