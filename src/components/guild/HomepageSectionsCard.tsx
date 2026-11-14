import { useState } from "react";
import {
  deleteAnnouncement,
  listHomepageSections,
  moveSection,
  setSectionEnabled,
} from "@/lib/guild/homepage-sections.server";
import type { HomepageSectionsData, SettingsSection } from "@/lib/guild/homepage-sections";
import { REFRESH_FAILED_TEXT, writeThenRefresh } from "@/lib/guild/write-then-refresh";
import { pacificToday } from "@/lib/home/sections";
import { CURRENT_SPOTLIGHT } from "@/lib/home/spotlight";
import { Switch } from "@/components/ui/switch";
import { AnnouncementForm } from "@/components/guild/AnnouncementForm";
import { AnnouncementGallery } from "@/components/guild/AnnouncementGallery";
import {
  cardClass,
  darkButtonClass,
  errorText,
  StatusMessage,
  type Message,
} from "@/components/guild/settings-ui";

const rowButtonClass =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-[8px] border border-[#D3CBBD] bg-canvas px-2 text-[12px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** "2026-12-20" as "Dec 20", or "Dec 20, 2027" when it isn't in the current Pacific year. */
function shortDate(day: string, now: Date): string {
  const sameYear = day.slice(0, 4) === pacificToday(now).slice(0, 4);
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export function statusLabel(s: SettingsSection, now: Date = new Date()): string {
  if (s.status === "off") return "Off";
  if (s.status === "scheduled") {
    return s.starts_on ? `Scheduled · from ${shortDate(s.starts_on, now)}` : "Scheduled";
  }
  if (s.status === "ended") return s.ends_on ? `Ended · ${shortDate(s.ends_on, now)}` : "Ended";
  return s.ends_on ? `Showing · until ${shortDate(s.ends_on, now)}` : "Showing";
}

function rowLabel(s: SettingsSection): string {
  if (s.kind === "events") return "Events carousel";
  if (s.kind === "spotlight") {
    return CURRENT_SPOTLIGHT ? `${CURRENT_SPOTLIGHT.eyebrow} spotlight` : "Spotlight";
  }
  return s.alt_text?.trim() || s.image?.alt_text || "Image";
}

/**
 * Settings > Homepage sections: the blocks under the homepage image, in order.
 * Move, switch on or off, and add, edit or delete image announcements; the
 * announcement gallery sits below. Every action saves straight away, then the
 * list is re-read so positions and statuses are accurate.
 */
export function HomepageSectionsCard({ initial }: { initial: HomepageSectionsData | null }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [form, setForm] = useState<{ editing: SettingsSection | null } | null>(null);

  async function refresh() {
    setData(await listHomepageSections());
  }

  // A refresh that fails after a successful write must not read as a failed write.
  async function refreshQuietly() {
    try {
      await refresh();
    } catch {
      setMessage({ kind: "error", text: REFRESH_FAILED_TEXT });
    }
  }

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      const { refreshFailed } = await writeThenRefresh(work, refresh);
      if (refreshFailed) setMessage({ kind: "error", text: REFRESH_FAILED_TEXT });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  function onDelete(s: SettingsSection) {
    if (!window.confirm(`Delete the announcement "${rowLabel(s)}"? The image stays in the gallery.`)) {
      return;
    }
    void act(() => deleteAnnouncement({ data: { id: s.id } }));
  }

  if (!data) {
    return (
      <section aria-labelledby="homepage-sections-heading" className={cardClass}>
        <h2 id="homepage-sections-heading" className="text-[16px] font-semibold text-ink">
          Homepage sections
        </h2>
        <p role="alert" className="text-[13px] text-red-700">
          Couldn't load the homepage sections — reload the page to try again.
        </p>
      </section>
    );
  }

  const { sections } = data;
  return (
    <section aria-labelledby="homepage-sections-heading" className={cardClass}>
      <div className="flex flex-col gap-1">
        <h2 id="homepage-sections-heading" className="text-[16px] font-semibold text-ink">
          Homepage sections
        </h2>
        <p className="text-pretty text-[13px] leading-[1.5] text-ink-muted">
          The blocks under the homepage image, top to bottom. Use the arrows to reorder, and the
          switch to show or hide one.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {sections.map((s, i) => {
          const label = rowLabel(s);
          const noSpotlight = s.kind === "spotlight" && !CURRENT_SPOTLIGHT;
          return (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-[11px] border border-canvas-border bg-canvas p-3"
            >
              <div className="flex items-center gap-3">
                {s.kind === "image" && s.imageUrl && (
                  <img src={s.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-[6px] object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{label}</p>
                  <p className="text-[12px] text-ink-muted">
                    {noSpotlight ? "No spotlight content right now" : statusLabel(s)}
                  </p>
                </div>
                <Switch
                  checked={s.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) =>
                    void act(() => setSectionEnabled({ data: { id: s.id, enabled } }))
                  }
                  aria-label={`Show ${label} on the homepage`}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={rowButtonClass}
                  disabled={busy || i === 0}
                  aria-label={`Move ${label} up`}
                  onClick={() => void act(() => moveSection({ data: { id: s.id, direction: -1 } }))}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className={rowButtonClass}
                  disabled={busy || i === sections.length - 1}
                  aria-label={`Move ${label} down`}
                  onClick={() => void act(() => moveSection({ data: { id: s.id, direction: 1 } }))}
                >
                  ▼
                </button>
                {s.kind === "image" && (
                  <>
                    <button
                      type="button"
                      className={rowButtonClass}
                      disabled={busy}
                      aria-label={`Edit ${label}`}
                      onClick={() => setForm({ editing: s })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={rowButtonClass}
                      disabled={busy}
                      aria-label={`Delete ${label}`}
                      onClick={() => onDelete(s)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <StatusMessage message={message} />

      {form ? (
        <AnnouncementForm
          key={form.editing?.id ?? "new"}
          editing={form.editing}
          gallery={data.gallery}
          memberPages={data.memberPages}
          onGalleryChanged={refresh}
          onSaved={async () => {
            setForm(null);
            await refreshQuietly();
          }}
          onCancel={() => setForm(null)}
        />
      ) : (
        <div>
          <button type="button" className={darkButtonClass} onClick={() => setForm({ editing: null })}>
            Add an image announcement
          </button>
        </div>
      )}

      {!form && (
        <div className="flex flex-col gap-2 border-t border-canvas-2 pt-4">
          <h3 className="text-[15px] font-semibold text-ink">Announcement images</h3>
          <AnnouncementGallery gallery={data.gallery} onChanged={refresh} />
        </div>
      )}
    </section>
  );
}
