import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  removeHeroImage,
  saveCalendarSyncInterval,
  saveCarouselDwell,
  uploadHeroImage,
} from "@/lib/guild/site-settings.server";
import {
  CALENDAR_SYNC_INTERVALS,
  CALENDAR_SYNC_INTERVAL_LABEL,
  CAROUSEL_DWELL_SECONDS,
  type CalendarSyncInterval,
  type CarouselDwellSeconds,
  type SiteSettingsView,
} from "@/lib/guild/site-settings";
import defaultHeroImg from "@/assets/hero-home.jpg";

const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 font-sans text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const cardClass =
  "flex max-w-[640px] flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6";
const outlineButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
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
 * "Settings"; artboard Z): how often members' calendars are re-synced
 * automatically, how long each homepage carousel page stays up, and the
 * homepage hero image. Times are the Guild's (Pacific).
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

      <form onSubmit={onSubmit} className={cardClass}>
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

      <CarouselDwellCard settings={settings} onSaved={setSettings} />
      <HeroImageCard settings={settings} onSaved={setSettings} />
    </div>
  );
}

type CardProps = { settings: SiteSettingsView; onSaved: (settings: SiteSettingsView) => void };
type Message = { kind: "ok" | "error"; text: string } | null;

function StatusMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={message.kind === "error" ? "text-[13px] text-danger" : "text-[13px] text-ink-muted"}
    >
      {message.text}
    </p>
  );
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Couldn't save the setting — try again.";
}

/** Homepage events carousel: how long each page stays up (artboard Z). */
function CarouselDwellCard({ settings, onSaved }: CardProps) {
  const [choice, setChoice] = useState<CarouselDwellSeconds>(settings.carouselDwellSeconds);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      onSaved(await saveCarouselDwell({ data: { seconds: choice } }));
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={cardClass}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-semibold text-ink">Homepage events carousel</h2>
        <p className="text-pretty text-[13px] leading-[1.5] text-ink-muted">
          How long each calendar page stays up before the next one tears off. Visitors can always
          pause it or flip through by hand.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink">Show each event for</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={choice}
            disabled={saving}
            onChange={(e) => {
              setChoice(Number(e.target.value) as CarouselDwellSeconds);
              setMessage(null);
            }}
            className={fieldClass}
          >
            {CAROUSEL_DWELL_SECONDS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving || choice === settings.carouselDwellSeconds}
            className={darkButtonClass}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </label>
      <StatusMessage message={message} />
      <p className="border-t border-canvas-2 pt-3 text-[12px] text-ink-muted">
        Shows member events from the next 14 days, taking turns between members.
      </p>
    </form>
  );
}

function heroImageUrl(path: string | null): string {
  if (!path) return defaultHeroImg;
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  return `${base}/storage/v1/object/public/site-images/${path}`;
}

/** Homepage hero image: upload a replacement, or go back to the built-in one. */
function HeroImageCard({ settings, onSaved }: CardProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      onSaved(await uploadHeroImage({ data: form }));
      setMessage({ kind: "ok", text: "Uploaded. The homepage shows it now." });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await removeHeroImage());
      setMessage({ kind: "ok", text: "Back to the built-in image." });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const uploaded = settings.heroImagePath !== null;
  return (
    <section aria-labelledby="hero-image-heading" className={cardClass}>
      <div className="flex flex-col gap-1">
        <h2 id="hero-image-heading" className="text-[16px] font-semibold text-ink">
          Homepage hero image
        </h2>
        <p className="text-pretty text-[13px] leading-[1.5] text-ink-muted">
          The wide photo behind the welcome message at the top of the homepage. Use a landscape
          photo at least 2000 pixels wide; the middle of it always shows. JPEG or PNG, up to 10 MB.
        </p>
      </div>
      <div className="aspect-[16/6] w-full overflow-hidden rounded-[11px] border border-canvas-border bg-canvas-2">
        <img
          src={heroImageUrl(settings.heroImagePath)}
          alt="Current homepage hero image"
          className="h-full w-full object-cover"
        />
      </div>
      <p className="text-[12px] text-ink-muted">
        {uploaded ? "Showing your uploaded image." : "Showing the built-in image."}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id="hero-image-file"
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Homepage hero image file"
          className="sr-only"
          tabIndex={-1}
          disabled={busy}
          onChange={(e) => void onFile(e)}
        />
        <button
          type="button"
          className={darkButtonClass}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Working…" : uploaded ? "Replace image" : "Upload an image"}
        </button>
        {uploaded && (
          <button
            type="button"
            className={outlineButtonClass}
            disabled={busy}
            onClick={() => void onRemove()}
          >
            Use the built-in image
          </button>
        )}
      </div>
      <StatusMessage message={message} />
    </section>
  );
}
