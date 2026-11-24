import { useState } from "react";
import { deleteListing, setListingStatus, type MarketplaceSection as Data } from "@/lib/marketplace/marketplace.server";
import { ListingForm } from "@/components/marketplace/ListingForm";
import { MarketplaceBrowse } from "@/components/marketplace/MarketplaceBrowse";
import { KindPill } from "@/components/marketplace/ListingParts";
import { InfoBox, primaryButtonClass, secondaryButtonClass } from "@/components/admin/basics/ui";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { listingDate, listingState, priceText, type ListingState, type MarketplaceListing } from "@/lib/marketplace/marketplace";

const STATE_PILL: Record<ListingState, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-[#E4F0E1] text-[#2F5E2C]" },
  closed: { label: "Closed", className: "bg-[#F2EEE7] text-ink-muted" },
  expired: { label: "Expired", className: "bg-[#F2EEE7] text-ink-muted" },
};

const byNewest = (a: MarketplaceListing, b: MarketplaceListing) => b.postedAt.localeCompare(a.postedAt);

/** The Producer marketplace, in the portal and /admin: Browse and My listings. */
export function MarketplaceSection({
  memberId,
  isPublished,
  initial,
}: {
  memberId: string;
  isPublished: boolean;
  initial: Data;
}) {
  const [open, setOpen] = useState(initial.open);
  const [mine, setMine] = useState(initial.mine);
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [editing, setEditing] = useState<MarketplaceListing | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function replace(listing: MarketplaceListing) {
    const swap = (list: MarketplaceListing[]) => [listing, ...list.filter((l) => l.id !== listing.id)].sort(byNewest);
    setMine(swap);
    const shows = isPublished && listingState(listing, new Date()) === "open";
    setOpen((list) => (shows ? swap(list) : list.filter((l) => l.id !== listing.id)));
  }

  function remove(id: string) {
    setMine((list) => list.filter((l) => l.id !== id));
    setOpen((list) => list.filter((l) => l.id !== id));
  }

  const tabs = [
    { key: "browse" as const, label: "Browse", count: open.length },
    { key: "mine" as const, label: "My listings", count: mine.length },
  ];

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[640px] flex-col gap-1.5">
          <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[28px]">Marketplace</h1>
          <p className="text-pretty text-[13px] text-ink-muted">
            Used equipment, excess inventory, services and In Search Of posts, for Guild Producers only. The public
            can't see it. Alcohol can't be listed.
          </p>
        </div>
        {editing === null && (
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => {
              setNote(null);
              setEditing("new");
            }}
          >
            Post a listing
          </button>
        )}
      </header>

      {!isPublished && (
        <InfoBox>
          Your profile isn't published yet. You can prepare listings now, but other Producers see them, and you see
          theirs, once it is.
        </InfoBox>
      )}

      {editing !== null ? (
        <ListingForm
          key={editing === "new" ? "new" : editing.id}
          memberId={memberId}
          listing={editing === "new" ? null : editing}
          categories={initial.categories}
          contact={initial.contact}
          onCancel={() => setEditing(null)}
          onSaved={(listing) => {
            replace(listing);
            setNote(editing === "new" ? "Posted." : "Saved.");
            setEditing(null);
            setTab("mine");
          }}
        />
      ) : (
        <>
          <div className="flex gap-2" role="group" aria-label="Marketplace views">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => {
                  setNote(null);
                  setTab(t.key);
                }}
                className={cn(
                  "inline-flex h-11 items-center rounded-[9px] border px-[15px] text-[13px]",
                  tab === t.key
                    ? "border-ink bg-ink font-semibold text-canvas"
                    : "border-canvas-border bg-white text-ink hover:bg-canvas-2",
                )}
              >
                {t.label}
                <span className={cn("ml-2 text-[12px]", tab === t.key ? "text-canvas/70" : "text-ink-muted")}>{t.count}</span>
              </button>
            ))}
          </div>
          {note && (
            <p role="status" className="text-[13px] font-medium text-ink">
              {note}
            </p>
          )}
          {tab === "browse" ? (
            <MarketplaceBrowse listings={open} categories={initial.categories} />
          ) : (
            <MyListings listings={mine} onEdit={setEditing} onChanged={replace} onDeleted={remove} />
          )}
        </>
      )}
    </div>
  );
}

const smallButtonClass = cn(secondaryButtonClass, "px-[14px] text-[12px]");

function MyListings({
  listings,
  onEdit,
  onChanged,
  onDeleted,
}: {
  listings: MarketplaceListing[];
  onEdit: (listing: MarketplaceListing) => void;
  onChanged: (listing: MarketplaceListing) => void;
  onDeleted: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MarketplaceListing | null>(null);
  const now = new Date();

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (listings.length === 0) {
    return (
      <p className="rounded-[14px] border border-[#DED7CB] bg-white px-5 py-10 text-center text-[14px] text-ink-muted">
        You haven't posted anything yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <ul className="overflow-hidden rounded-[14px] border border-[#DED7CB] bg-white">
        {listings.map((l) => {
          const state = listingState(l, now);
          const busy = busyId === l.id;
          return (
            <li
              key={l.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#F0EBE3] px-5 py-4 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1.5">
                <KindPill kind={l.kind} />
                <span className="break-words text-[14px] font-semibold text-ink">{l.title}</span>
                <span className="text-[12px] text-ink-muted">
                  {priceText(l)} · Posted {listingDate(l.postedAt)}
                  {state !== "closed" && ` · ${state === "open" ? "Listed until" : "Expired"} ${listingDate(l.expiresAt)}`}
                </span>
              </div>
              <span className={cn("rounded-full px-[11px] py-1 text-[11px] font-semibold", STATE_PILL[state].className)}>
                {STATE_PILL[state].label}
              </span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={smallButtonClass} disabled={busy} aria-label={`Edit ${l.title}`} onClick={() => onEdit(l)}>
                  Edit
                </button>
                <button
                  type="button"
                  className={smallButtonClass}
                  disabled={busy}
                  aria-label={`${state === "open" ? "Close" : "Renew"} ${l.title}`}
                  onClick={() =>
                    run(l.id, async () =>
                      onChanged(await setListingStatus({ data: { id: l.id, action: state === "open" ? "close" : "renew" } })),
                    )
                  }
                >
                  {state === "open" ? "Close" : "Renew"}
                </button>
                <button type="button" className={smallButtonClass} disabled={busy} aria-label={`Delete ${l.title}`} onClick={() => setToDelete(l)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
      <DeleteListingDialog
        listing={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={async (l) => {
          await run(l.id, async () => {
            await deleteListing({ data: { id: l.id } });
            onDeleted(l.id);
          });
          setToDelete(null);
        }}
      />
    </div>
  );
}

export function DeleteListingDialog({
  listing,
  onCancel,
  onConfirm,
}: {
  listing: MarketplaceListing | null;
  onCancel: () => void;
  onConfirm: (listing: MarketplaceListing) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={listing !== null} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[460px]">
        <AlertDialogHeader className="gap-1.5 text-left">
          <AlertDialogTitle className="font-display text-[22px] font-bold leading-tight text-ink">Delete this listing?</AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            “{listing?.title}” and its photos are removed for good. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={busy} className={cn(secondaryButtonClass, "mt-0")}>
            Cancel
          </AlertDialogCancel>
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-[9px] bg-danger px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            onClick={async () => {
              if (!listing) return;
              setBusy(true);
              await onConfirm(listing);
              setBusy(false);
            }}
          >
            {busy ? "Deleting…" : "Delete listing"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
