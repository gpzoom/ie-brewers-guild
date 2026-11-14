import { useState, type FormEvent } from "react";
import { saveAnnouncement } from "@/lib/guild/homepage-sections.server";
import type { GalleryImage, SettingsSection } from "@/lib/guild/homepage-sections";
import { INTERNAL_PAGES, type LinkKind } from "@/lib/home/sections";
import { AnnouncementGallery } from "@/components/guild/AnnouncementGallery";
import {
  darkButtonClass,
  errorText,
  fieldClass,
  outlineButtonClass,
  StatusMessage,
  type Message,
} from "@/components/guild/settings-ui";

const LINK_CHOICES: Array<{ kind: LinkKind; label: string }> = [
  { kind: "none", label: "None" },
  { kind: "internal", label: "A page on our site" },
  { kind: "external", label: "An outside website" },
];

/** Add or edit one image announcement: image, description, link, and dates. */
export function AnnouncementForm({
  editing,
  gallery,
  memberPages,
  onGalleryChanged,
  onSaved,
  onCancel,
}: {
  editing: SettingsSection | null;
  gallery: GalleryImage[];
  memberPages: Array<{ path: string; label: string }>;
  onGalleryChanged: () => Promise<void>;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [imageId, setImageId] = useState<string | null>(editing?.image_id ?? null);
  const [altText, setAltText] = useState(editing?.alt_text ?? "");
  const [linkKind, setLinkKind] = useState<LinkKind>(editing?.link_kind ?? "none");
  const [internalTarget, setInternalTarget] = useState(
    editing?.link_kind === "internal" ? (editing.link_target ?? "") : "",
  );
  const [externalTarget, setExternalTarget] = useState(
    editing?.link_kind === "external" ? (editing.link_target ?? "") : "",
  );
  const [startsOn, setStartsOn] = useState(editing?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(editing?.ends_on ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const chosen = gallery.find((g) => g.id === imageId) ?? null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!imageId) {
      setMessage({ kind: "error", text: "Choose an image." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await saveAnnouncement({
        data: {
          id: editing?.id,
          imageId,
          altText: altText.trim() || null,
          linkKind,
          linkTarget:
            linkKind === "internal"
              ? internalTarget
              : linkKind === "external"
                ? externalTarget
                : null,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          enabled: editing?.enabled ?? true,
        },
      });
      await onSaved();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-[11px] border border-canvas-border bg-canvas p-3 md:p-4"
    >
      <h3 className="text-[15px] font-semibold text-ink">
        {editing ? "Edit announcement" : "Add an announcement"}
      </h3>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink">Image</span>
        <AnnouncementGallery
          gallery={gallery}
          onChanged={onGalleryChanged}
          selectedId={imageId}
          onSelect={setImageId}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink">Description (optional)</span>
        <input
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          placeholder={chosen?.alt ?? "Uses the image's own description"}
          className={fieldClass}
        />
        <span className="text-[12px] text-ink-muted">
          Only for this announcement. Leave it empty to use the image's own description.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-medium text-ink">Link</legend>
        {LINK_CHOICES.map((choice) => (
          <label key={choice.kind} className="flex min-h-9 items-center gap-2 text-[14px] text-ink">
            <input
              type="radio"
              name="link-kind"
              checked={linkKind === choice.kind}
              onChange={() => setLinkKind(choice.kind)}
            />
            {choice.label}
          </label>
        ))}
        {linkKind === "internal" && (
          <select
            value={internalTarget}
            onChange={(e) => setInternalTarget(e.target.value)}
            aria-label="Page on our site"
            className={fieldClass}
          >
            <option value="">Choose a page…</option>
            <optgroup label="Site pages">
              {INTERNAL_PAGES.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            {memberPages.length > 0 && (
              <optgroup label="Member pages">
                {memberPages.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        {linkKind === "external" && (
          <input
            type="url"
            value={externalTarget}
            onChange={(e) => setExternalTarget(e.target.value)}
            placeholder="https://example.com"
            aria-label="Web address"
            className={fieldClass}
          />
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Start showing on (optional)</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Stop showing after (optional)</span>
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>
      <p className="-mt-2 text-[12px] text-ink-muted">
        Dates are Pacific time. Leave both empty to show it until you turn it off.
      </p>

      <StatusMessage message={message} />
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={darkButtonClass}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className={outlineButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
