import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LINK_KINDS } from "@/lib/links/link-kinds";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL } from "@/lib/members/type-fields";
import type { DraftLink } from "@/lib/drafts/sections";
import type { MemberLinkKind, MemberType } from "@/lib/supabase/types";
import { SaveNoteText } from "@/components/admin/SaveNote";
import { useSaveDraftSection } from "@/components/admin/DraftStatusContext";

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

/** A draft link plus a client-only key (draft links have no ids). */
type LinkRow = DraftLink & { id: string };
type LinkPatch = Partial<Pick<DraftLink, "kind" | "label" | "url">>;

/**
 * Picks just the given keys off `obj`, so a rollback is scoped to only the
 * fields a given patch touched, never the whole row.
 */
function pickFields<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) picked[key] = obj[key];
  return picked;
}

function toDraftLinks(rows: LinkRow[]): DraftLink[] {
  // Stored in the order shown; publish renumbers them 0..n-1 the same way.
  return rows.map(({ id: _id, ...link }, index) => ({ ...link, sort_order: index }));
}

/**
 * Links & contact (artboard R). The link pills save to the member's DRAFT
 * (the `links` section, sent whole on every change) and go live when
 * published. Phone and sales email moved to Basics & hours (plan Decision
 * 2) -- they belong to the draft's `basics` section -- so the Contact part
 * here just shows them, with the address, and points there.
 */
export function LinksContactEditor({
  memberId,
  initialLinks,
  memberType,
  contact,
}: {
  memberId: string;
  initialLinks: DraftLink[];
  memberType: MemberType;
  /** Read-only here -- edited on Basics & hours. */
  contact: {
    phone: string | null;
    contactEmail: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
  };
}) {
  const saveDraft = useSaveDraftSection(memberId);
  const [links, setLinks] = useState<LinkRow[]>(() =>
    initialLinks.map((link, index) => ({ ...link, id: `link-${index}` })),
  );
  // Updated synchronously with every change, so each save sends the list as
  // it stands right now (saves are queued in order by useSaveDraftSection).
  const linksRef = useRef<LinkRow[]>(links);
  const [error, setError] = useState<string | null>(null);

  function updateLinks(update: (prev: LinkRow[]) => LinkRow[]) {
    linksRef.current = update(linksRef.current);
    setLinks(linksRef.current);
  }

  // Built from the ref when the save RUNS (the patch is a function), so a
  // save queued before another edit still sends the latest list.
  function saveList() {
    return saveDraft("links", () => ({ links: toDraftLinks(linksRef.current) }));
  }

  async function onAdd() {
    setError(null);
    const row: LinkRow = {
      id: crypto.randomUUID(),
      kind: "website",
      label: null,
      url: "",
      sort_order: null,
    };
    // Shown straight away, so any save from now on includes it; taken back
    // out if its save fails.
    updateLinks((prev) => [...prev, row]);
    try {
      await saveList();
    } catch (err) {
      updateLinks((prev) => prev.filter((l) => l.id !== row.id));
      setError(friendlyMessage(err, "Couldn't add a new link — try again."));
    }
  }

  /**
   * Optimistic, and rolls back on failure -- scoped to just the fields THIS
   * patch touched, on this link, read at rollback time, so a failure never
   * undoes a different change that succeeded meanwhile.
   */
  function onFieldChange(link: LinkRow, patch: LinkPatch) {
    setError(null);
    const previousValues = pickFields(link, Object.keys(patch) as (keyof LinkRow)[]);
    updateLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...patch } : l)));
    saveList().catch((err: unknown) => {
      updateLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...previousValues } : l)));
      setError(friendlyMessage(err, "Couldn't save that change — try again."));
    });
  }

  async function onRemove(id: string) {
    setError(null);
    const index = linksRef.current.findIndex((l) => l.id === id);
    const removed = linksRef.current[index];
    updateLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await saveList();
    } catch (err) {
      // Put back just this one link, where it was, into the CURRENT list.
      if (removed) {
        updateLinks((prev) => {
          if (prev.some((l) => l.id === id)) return prev;
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
      }
      setError(friendlyMessage(err, "Couldn't remove this link — try again."));
    }
  }

  const phoneLabel =
    memberType === "mobile" ? "Booking phone" : memberType === "allied" ? "Sales phone" : "Phone";
  const showEmail = memberType === "allied";
  const showAddress = isFieldVisibleForMemberType(memberType, "street_address");
  const addressText = contact.street
    ? [contact.street, contact.city, contact.state].filter(Boolean).join(", ")
    : null;

  const contactRows: { label: string; value: string | null }[] = [
    { label: phoneLabel, value: contact.phone },
    ...(showEmail ? [{ label: "Sales email", value: contact.contactEmail }] : []),
    ...(showAddress ? [{ label: LOCATION_FIELD_LABEL[memberType], value: addressText }] : []),
  ];

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
                  onChange={(e) => onFieldChange(link, { kind: e.target.value as MemberLinkKind })}
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
                    onBlur={(e) => {
                      if (e.target.value !== link.url) onFieldChange(link, { url: e.target.value });
                    }}
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
        <div className="flex flex-col gap-2.5 rounded-[11px] border border-canvas-2 bg-[#F2EEE7] px-[15px] py-3">
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-[auto_minmax(0,1fr)]">
            {contactRows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-[13px] font-medium text-ink">{row.label}</dt>
                <dd
                  className={`m-0 min-w-0 break-words text-sm ${row.value ? "text-ink" : "text-ink-subtle"}`}
                >
                  {row.value ?? "Not added yet"}
                </dd>
              </div>
            ))}
          </dl>
          <Link
            to="/admin/basics"
            className="inline-flex min-h-11 items-center self-start text-[13px] font-medium text-brand hover:text-brand-hover"
          >
            Edit on Basics &amp; hours
          </Link>
        </div>
        <p className="text-xs text-ink-subtle">
          These are edited with your other basics, so there's only one place to keep them right.
        </p>
      </section>

      <div className="flex items-center gap-5 border-t border-[#E6E0D6] pt-[22px]">
        <p className="text-[13px] text-ink-muted">
          <SaveNoteText />
        </p>
      </div>
    </div>
  );
}
