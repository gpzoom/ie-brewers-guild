import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { saveListing, uploadListingPhoto } from "@/lib/marketplace/marketplace.server";
import { normalizePhotoForUpload } from "@/lib/media/normalize-photo";
import {
  Field,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionLabelClass,
  textInputClass,
} from "@/components/admin/basics/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CONDITION_LABELS,
  CONDITIONS,
  KIND_LABELS,
  LISTING_DAYS,
  LISTING_KINDS,
  LISTING_LIMITS,
  MAX_PHOTOS,
  validateListing,
  type ListingInput,
  type ListingKind,
  type MarketplaceCategory,
  type MarketplaceListing,
} from "@/lib/marketplace/marketplace";

const selectClass = cn(textInputClass, "w-full border px-3");

const PLACEHOLDERS: Record<ListingKind, { title: string; description: string }> = {
  equipment: { title: "e.g. 7 BBL jacketed fermenter", description: "Size, age, what's included, and how it can be picked up." },
  inventory: { title: "e.g. 40 sacks of 2-row malt", description: "How much you have, lot or best-by dates, and how it's been stored." },
  service: { title: "e.g. Keg washing, 1/2 and 1/6 BBL", description: "What you do, how much you can handle, and turnaround time." },
  wanted: { title: "e.g. In search of a 10 HP glycol chiller", description: "What you need, by when, and what would work for you." },
};

function priceInput(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function startingInput(listing: MarketplaceListing | null, contact: { email: string; phone: string }): ListingInput {
  return {
    kind: listing?.kind ?? "equipment",
    categoryId: listing?.categoryId ?? "",
    title: listing?.title ?? "",
    description: listing?.description ?? "",
    condition: listing?.condition ?? "",
    price: priceInput(listing?.priceCents ?? null),
    priceUnit: listing?.priceUnit ?? "",
    negotiable: listing?.negotiable ?? false,
    locationText: listing?.locationText ?? "",
    contactName: listing?.contactName ?? "",
    contactEmail: listing ? (listing.contactEmail ?? "") : contact.email,
    contactPhone: listing ? (listing.contactPhone ?? "") : contact.phone,
    photoPaths: listing?.photoPaths ?? [],
    // Confirmed when it was first posted.
    noAlcohol: listing !== null,
  };
}

export function ListingForm({
  memberId,
  listing,
  categories,
  contact,
  onSaved,
  onCancel,
}: {
  memberId: string;
  /** Null for a new one. */
  listing: MarketplaceListing | null;
  categories: MarketplaceCategory[];
  contact: { email: string; phone: string };
  onSaved: (listing: MarketplaceListing) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => startingInput(listing, contact));
  const [urls, setUrls] = useState<Record<string, string | null>>(() =>
    Object.fromEntries((listing?.photoPaths ?? []).map((path, i) => [path, listing?.photoUrls[i] ?? null])),
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const set = <K extends keyof ListingInput>(key: K, value: ListingInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const wanted = form.kind === "wanted";
  const sold = form.kind === "equipment" || form.kind === "inventory";

  async function addPhotos(picked: File[]) {
    setPhotoError(null);
    const room = MAX_PHOTOS - form.photoPaths.length;
    if (picked.length > room) setPhotoError(`Up to ${MAX_PHOTOS} photos; the extra ones weren't added.`);
    setUploading(true);
    try {
      for (const original of picked.slice(0, room)) {
        const file = await normalizePhotoForUpload(original);
        const data = new FormData();
        data.append("memberId", memberId);
        data.append("file", file);
        const { path, url } = await uploadListingPhoto({ data });
        setUrls((u) => ({ ...u, [path]: url }));
        setForm((f) => ({ ...f, photoPaths: [...f.photoPaths, path] }));
      }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't upload the photo — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateListing(form);
    if (!result.ok) return setError(result.error);
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveListing({ data: { memberId, id: listing?.id ?? null, input: form } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex max-w-[760px] flex-col gap-4 rounded-[14px] border border-[#DED7CB] bg-white p-5 md:p-6"
    >
      <h2 ref={headingRef} tabIndex={-1} className={cn(sectionLabelClass, "focus:outline-none")}>
        {listing ? "Edit listing" : "Post a listing"}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="listing-kind" label="Listing type">
          <select
            id="listing-kind"
            value={form.kind}
            onChange={(e) => set("kind", e.target.value as ListingKind)}
            className={selectClass}
          >
            {LISTING_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="listing-category" label="Category">
          <select
            id="listing-category"
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            className={selectClass}
          >
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="listing-title" label="Title">
        <Input
          id="listing-title"
          value={form.title}
          maxLength={LISTING_LIMITS.title}
          placeholder={PLACEHOLDERS[form.kind].title}
          onChange={(e) => set("title", e.target.value)}
          className={textInputClass}
        />
      </Field>

      <Field id="listing-description" label="Description">
        <textarea
          id="listing-description"
          rows={5}
          value={form.description}
          maxLength={LISTING_LIMITS.description}
          placeholder={PLACEHOLDERS[form.kind].description}
          onChange={(e) => set("description", e.target.value)}
          className="resize-y rounded-[10px] border border-canvas-border bg-white px-[14px] py-[13px] text-[15px] leading-[1.5] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:rounded-[9px] md:text-[14px]"
        />
      </Field>

      <div className="flex flex-col gap-2.5">
        <span className={fieldLabelClass}>Photos (up to {MAX_PHOTOS})</span>
        {form.photoPaths.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {form.photoPaths.map((path, i) => (
              <li key={path} className="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-canvas-2">
                {urls[path] && <img src={urls[path]} alt={`Photo ${i + 1}`} className="h-full w-full object-contain" />}
                {i === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-ink/80 px-2 py-0.5 text-[11px] text-canvas">First photo</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => set("photoPaths", form.photoPaths.filter((p) => p !== path))}
                  className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-ink/80 text-canvas hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.photoPaths.length < MAX_PHOTOS && (
          <label
            className={cn(
              secondaryButtonClass,
              "w-fit cursor-pointer focus-within:ring-2 focus-within:ring-brand",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? "Uploading…" : "Add photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void addPhotos(files);
              }}
            />
          </label>
        )}
        {photoError && (
          <p role="alert" className="text-[12px] font-medium text-danger">
            {photoError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="listing-price"
          label={wanted ? "Budget (optional)" : "Price (optional)"}
          hint={wanted ? "Leave it empty to show “Budget open”." : "Leave it empty to show “Contact for price”. Enter 0 for free."}
        >
          <Input
            id="listing-price"
            inputMode="decimal"
            value={form.price}
            placeholder="$"
            onChange={(e) => set("price", e.target.value)}
            className={textInputClass}
          />
        </Field>
        <Field id="listing-unit" label="Per (optional)" hint="For prices by the piece, such as keg or sack.">
          <Input
            id="listing-unit"
            value={form.priceUnit}
            maxLength={LISTING_LIMITS.priceUnit}
            placeholder="e.g. keg"
            onChange={(e) => set("priceUnit", e.target.value)}
            className={textInputClass}
          />
        </Field>
        {sold && (
          <Field id="listing-condition" label="Condition (optional)">
            <select
              id="listing-condition"
              value={form.condition}
              onChange={(e) => set("condition", e.target.value as ListingInput["condition"])}
              className={selectClass}
            >
              <option value="">Not stated</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="listing-location" label="Location (optional)" hint="Leave it empty to show your city.">
          <Input
            id="listing-location"
            value={form.locationText}
            maxLength={LISTING_LIMITS.location}
            onChange={(e) => set("locationText", e.target.value)}
            className={textInputClass}
          />
        </Field>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={form.negotiable}
          onChange={(e) => set("negotiable", e.target.checked)}
          className="h-5 w-5 accent-brand"
        />
        {wanted ? "My budget is flexible" : "Open to offers"}
      </label>

      <fieldset className="flex flex-col gap-4 border-t border-canvas-2 pt-4">
        <legend className={cn(sectionLabelClass, "pr-2")}>How Producers reach you</legend>
        <p className="text-[12px] text-ink-muted">
          Only signed-in Producers and Guild admins see this. Give an email address, a phone number or both.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="listing-contact" label="Contact name (optional)">
            <Input
              id="listing-contact"
              value={form.contactName}
              maxLength={LISTING_LIMITS.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              className={textInputClass}
            />
          </Field>
          <Field id="listing-email" label="Email">
            <Input
              id="listing-email"
              type="email"
              value={form.contactEmail}
              maxLength={LISTING_LIMITS.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              className={textInputClass}
            />
          </Field>
          <Field id="listing-phone" label="Phone">
            <Input
              id="listing-phone"
              type="tel"
              value={form.contactPhone}
              maxLength={LISTING_LIMITS.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              className={textInputClass}
            />
          </Field>
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={form.noAlcohol}
          onChange={(e) => set("noAlcohol", e.target.checked)}
          className="h-5 w-5 shrink-0 accent-brand"
        />
        This listing isn't for beer, wine, spirits or any other alcohol.
      </label>

      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1.5">
        <p className="text-[12px] text-ink-muted">
          Stays listed for {LISTING_DAYS} days, or until you close it. You can renew it.
        </p>
        <div className="flex gap-2.5">
          <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={saving || uploading}>
            {saving ? "Saving…" : listing ? "Save changes" : "Post listing"}
          </button>
        </div>
      </div>
    </form>
  );
}
