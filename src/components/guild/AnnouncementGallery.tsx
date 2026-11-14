import { useRef, useState, type ChangeEvent } from "react";
import {
  deleteGalleryImage,
  updateGalleryAlt,
  uploadGalleryImage,
} from "@/lib/guild/homepage-sections.server";
import type { GalleryImage } from "@/lib/guild/homepage-sections";
import {
  darkButtonClass,
  errorText,
  fieldClass,
  outlineButtonClass,
  StatusMessage,
  type Message,
} from "@/components/guild/settings-ui";

const smallButtonClass =
  "inline-flex h-9 items-center justify-center rounded-[8px] border border-[#D3CBBD] bg-canvas px-3 text-[12px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * The announcement image gallery: thumbnails with their descriptions, plus
 * Upload, Edit description and Delete. With `onSelect`, a thumbnail can also
 * be picked (the announcement form uses it as its image picker). Every change
 * is saved straight away, then `onChanged` refreshes the list.
 */
export function AnnouncementGallery({
  gallery,
  onChanged,
  selectedId,
  onSelect,
}: {
  gallery: GalleryImage[];
  onChanged: () => Promise<void>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [uploadAlt, setUploadAlt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function run(work: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const done = await work();
      await onChanged();
      if (done) setMessage({ kind: "ok", text: done });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!uploadAlt.trim()) {
      setMessage({ kind: "error", text: "Add a short description of the image first." });
      return;
    }
    await run(async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("altText", uploadAlt.trim());
      const { id } = await uploadGalleryImage({ data: form });
      setUploadAlt("");
      onSelect?.(id);
      return "Uploaded.";
    });
  }

  function onDelete(image: GalleryImage) {
    if (!window.confirm(`Delete "${image.alt}" from the gallery?`)) return;
    void run(async () => {
      await deleteGalleryImage({ data: { id: image.id } });
      return "Deleted.";
    });
  }

  function onSaveAlt(image: GalleryImage) {
    void run(async () => {
      await updateGalleryAlt({ data: { id: image.id, altText: editAlt } });
      setEditingId(null);
      return "Saved.";
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {gallery.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No images yet. Upload one below.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gallery.map((image) => {
            const selected = selectedId === image.id;
            return (
              <li
                key={image.id}
                className={`flex flex-col gap-2 rounded-[11px] border bg-white p-2 ${
                  selected ? "border-ink ring-2 ring-brand" : "border-canvas-border"
                }`}
              >
                <div className="aspect-[4/3] w-full overflow-hidden rounded-[8px] bg-canvas-2">
                  <img src={image.imageUrl} alt={image.alt} className="h-full w-full object-cover" />
                </div>
                {editingId === image.id ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      value={editAlt}
                      onChange={(e) => setEditAlt(e.target.value)}
                      aria-label="Image description"
                      className={fieldClass}
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className={smallButtonClass}
                        disabled={busy}
                        onClick={() => onSaveAlt(image)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={smallButtonClass}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-pretty text-[12px] leading-snug text-ink">{image.alt}</p>
                    {image.usedBy.length > 0 && (
                      <p className="text-[11px] text-ink-muted">Used by {image.usedBy.join(", ")}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {onSelect && (
                        <button
                          type="button"
                          className={smallButtonClass}
                          aria-pressed={selected}
                          onClick={() => onSelect(image.id)}
                        >
                          {selected ? "Chosen" : "Use this"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={smallButtonClass}
                        disabled={busy}
                        onClick={() => {
                          setEditingId(image.id);
                          setEditAlt(image.alt);
                        }}
                      >
                        Edit description
                      </button>
                      <button
                        type="button"
                        className={smallButtonClass}
                        disabled={busy}
                        aria-label={`Delete image ${image.alt}`}
                        onClick={() => onDelete(image)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-[11px] border border-dashed border-canvas-border p-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Describe the new image</span>
          <input
            value={uploadAlt}
            onChange={(e) => setUploadAlt(e.target.value)}
            placeholder="For example: Poster for the holiday party, Dec 12"
            className={fieldClass}
          />
          <span className="text-[12px] text-ink-muted">
            Screen readers read this aloud. JPEG or PNG, up to 10 MB.
          </span>
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Announcement image file"
          className="sr-only"
          tabIndex={-1}
          disabled={busy}
          onChange={(e) => void onFile(e)}
        />
        <div>
          <button
            type="button"
            className={gallery.length === 0 ? darkButtonClass : outlineButtonClass}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Working…" : "Upload new"}
          </button>
        </div>
      </div>
      <StatusMessage message={message} />
    </div>
  );
}
