import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  deleteMemberLink,
  LINK_KINDS,
  updateMemberContact,
  upsertMemberLink,
} from "@/lib/links/member-links.server";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL } from "@/lib/members/type-fields";
import type { MemberLinkKind, MemberLinkRow, MemberType } from "@/lib/supabase/types";
import { SaveNoteText } from "@/components/admin/SaveNote";

// Friendly names for the link kinds (artboard R's select options).
const LINK_KIND_LABEL: Partial<Record<MemberLinkKind, string>> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  taplist: "Tap list",
  menu: "Menu",
  press_kit: "Press kit",
  catalog: "Catalog",
  other: "Something else",
};

const controlClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-[13px] text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";
const sectionLabelClass = "text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted";

function friendlyMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Picks just the given keys off `obj` -- same shape as EventsEditor.tsx's
 * own pickFields, used here so onFieldChange's rollback snapshot is scoped
 * to only the fields a given patch actually touches, never the whole row.
 */
function pickFields<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) picked[key] = obj[key];
  return picked;
}

export function LinksContactEditor({
  memberId,
  initialLinks,
  phone,
  contactEmail,
  memberType,
  address,
}: {
  memberId: string;
  initialLinks: MemberLinkRow[];
  phone: string | null;
  contactEmail: string | null;
  memberType: MemberType;
  /** Read-only here -- the street address is edited on Basics & hours. */
  address?: { street: string | null; city: string | null; state: string | null };
}) {
  const [links, setLinks] = useState(initialLinks);
  const [error, setError] = useState<string | null>(null);

  async function onAdd() {
    setError(null);
    try {
      const { id } = await upsertMemberLink({
        data: { memberId, patch: { kind: "website", url: "", sort_order: links.length } },
      });
      // Nothing is optimistically added before this resolves, so there's
      // no rollback to do on failure here -- just surface the error (same
      // shape as EventsEditor.tsx's onAdd).
      setLinks((prev) => [
        ...prev,
        { id, member_id: memberId, kind: "website", label: null, url: "", sort_order: prev.length },
      ]);
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't add a new link — try again."));
    }
  }

  /**
   * Fire-and-forget from the caller's point of view (kept that way so a
   * Select's onValueChange / an Input's onBlur don't need to be async), but
   * now rolls back on failure instead of leaving a change the server never
   * actually saved silently showing in the UI. Rollback is scoped to just
   * the fields THIS patch touched, on the link's CURRENT id, via a
   * functional setLinks update read at rollback time -- not a whole-row or
   * whole-array snapshot captured when the call started. That's the exact
   * stale-whole-array-snapshot bug this plan has already found and fixed
   * multiple times (CarouselEditor's crop-autosave, CreatorLinkPanel's
   * onRevoke, ReviewTray's onApprove/onReject, EventsEditor's
   * onFieldChange/onOverlayChange/onToggleHidden): restoring an
   * old snapshot of the WHOLE list/row would silently undo any OTHER
   * change (to this link's other fields, or to a different link entirely)
   * that succeeded while this request was still in flight.
   */
  function onFieldChange(
    link: MemberLinkRow,
    patch: Parameters<typeof upsertMemberLink>[0]["data"]["patch"],
  ) {
    setError(null);
    const previousValues = pickFields(link, Object.keys(patch) as (keyof MemberLinkRow)[]);
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...patch } : l)));
    upsertMemberLink({ data: { memberId, id: link.id, patch } }).catch((err: unknown) => {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...previousValues } : l)));
      setError(friendlyMessage(err, "Couldn't save that change — try again."));
    });
  }

  async function onRemove(id: string) {
    setError(null);
    // Snapshot only the ONE link being removed, off the current `links`
    // closure at call time (same shape as CreatorLinkPanel.tsx's
    // onRevoke) -- not a whole-array snapshot restored wholesale on
    // failure, which could resurrect a DIFFERENT link that was itself
    // removed (and succeeded) while this one's request was still in
    // flight.
    const removed = links.find((l) => l.id === id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteMemberLink({ data: { id } });
    } catch (err) {
      // Reinsert by id into the CURRENT list (functional update), not the
      // stale snapshot from before other things may have changed --
      // matches EventsEditor.tsx's reinsertEvent for the same reason.
      if (removed) {
        setLinks((prev) =>
          prev.some((l) => l.id === id)
            ? prev
            : [...prev, removed].sort((a, b) => a.sort_order - b.sort_order),
        );
      }
      setError(friendlyMessage(err, "Couldn't remove this link — try again."));
    }
  }

  async function onPhoneBlur(value: string) {
    setError(null);
    try {
      await updateMemberContact({ data: { memberId, patch: { phone: value || null } } });
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't save that phone number — try again."));
    }
  }

  async function onContactEmailBlur(value: string) {
    setError(null);
    try {
      await updateMemberContact({ data: { memberId, patch: { contact_email: value || null } } });
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't save that email — try again."));
    }
  }

  const phoneLabel =
    memberType === "mobile" ? "Booking phone" : memberType === "allied" ? "Sales phone" : "Phone";
  const showEmail = memberType === "allied";
  const showAddress = isFieldVisibleForMemberType(memberType, "street_address");
  const addressText = address?.street
    ? [address.street, address.city, address.state].filter(Boolean).join(", ")
    : null;

  return (
    <div className="flex flex-col gap-[26px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          Links &amp; contact
        </h1>
        <p className="text-[13px] text-ink-muted">
          The pills on your profile, and the ways people reach you.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <section aria-labelledby="links-pills-label" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="links-pills-label" className={`font-sans ${sectionLabelClass}`}>
            Link pills
          </h2>
          <p className="text-xs text-ink-subtle">Shown on your profile in this order</p>
        </div>

        {links.length > 0 && (
          <ul className="flex flex-col gap-3">
            {links.map((link, index) => (
              <li
                key={link.id}
                className="flex flex-col gap-2.5 rounded-[11px] border border-canvas-border bg-white px-3.5 py-3 md:flex-row md:items-center md:gap-3"
              >
                <select
                  aria-label={`Link type for link ${index + 1}`}
                  value={link.kind}
                  onChange={(e) =>
                    onFieldChange(link, { kind: e.target.value as MemberLinkRow["kind"] })
                  }
                  className={`${controlClass} md:w-[170px] md:shrink-0`}
                >
                  {LINK_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {LINK_KIND_LABEL[kind] ?? kind}
                    </option>
                  ))}
                </select>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="url"
                    inputMode="url"
                    aria-label={`Link address for link ${index + 1}`}
                    defaultValue={link.url}
                    placeholder="https://…"
                    className={`${controlClass} min-w-0 flex-1`}
                    onBlur={(e) => onFieldChange(link, { url: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={`Remove link ${index + 1}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-[9px] text-ink-muted hover:bg-canvas-2 hover:text-ink"
                    onClick={() => onRemove(link.id)}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onAdd}
          className="flex h-[46px] items-center gap-[9px] self-start rounded-[9px] border border-dashed border-[#C6BDAE] px-[17px] text-[13px] font-medium text-ink hover:bg-canvas-2"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            className="text-ink-muted"
            aria-hidden="true"
          >
            <path
              d="M8 3.5v9M3.5 8h9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Add a link
        </button>
      </section>

      <section aria-labelledby="links-contact-label" className="flex flex-col gap-3.5">
        <h2 id="links-contact-label" className={`font-sans ${sectionLabelClass}`}>
          Contact
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="contact-phone" className="text-[13px] font-medium text-ink">
              {phoneLabel}
            </label>
            <input
              id="contact-phone"
              type="tel"
              aria-describedby="contact-phone-help"
              defaultValue={phone ?? ""}
              className={controlClass}
              onBlur={(e) => void onPhoneBlur(e.target.value)}
            />
            <p id="contact-phone-help" className="text-xs text-ink-subtle">
              Shown as a tap-to-call link
            </p>
          </div>
          {showEmail && (
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="contact-email" className="text-[13px] font-medium text-ink">
                Sales email
              </label>
              <input
                id="contact-email"
                type="email"
                aria-describedby="contact-email-help"
                defaultValue={contactEmail ?? ""}
                className={controlClass}
                onBlur={(e) => void onContactEmailBlur(e.target.value)}
              />
              <p id="contact-email-help" className="text-xs text-ink-subtle">
                Shown on your profile. Not the address you sign in with
              </p>
            </div>
          )}
        </div>

        {showAddress && (
          <div className="flex flex-col gap-[7px]">
            <p className="text-[13px] font-medium text-ink">{LOCATION_FIELD_LABEL[memberType]}</p>
            <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[9px] border border-canvas-2 bg-[#F2EEE7] px-[13px] py-2">
              <span className={`text-sm ${addressText ? "text-ink" : "text-ink-subtle"}`}>
                {addressText ?? "Not added yet"}
              </span>
              <Link
                to="/admin/basics"
                hash="street_address"
                className="inline-flex min-h-11 items-center text-[13px] font-medium text-brand hover:text-brand-hover"
              >
                Edit on Basics &amp; hours
              </Link>
            </div>
            <p className="text-xs text-ink-subtle">
              This is what the Directions button on your profile opens. It's edited with your other
              basics, so there's only one place to keep it right.
            </p>
          </div>
        )}
      </section>

      <div className="flex items-center gap-5 border-t border-[#E6E0D6] pt-[22px]">
        <p className="text-[13px] text-ink-muted">
          <SaveNoteText />
        </p>
      </div>
    </div>
  );
}
