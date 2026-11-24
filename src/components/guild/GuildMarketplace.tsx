import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  deleteListing,
  deleteMarketplaceCategory,
  orderMarketplaceCategories,
  saveMarketplaceCategory,
} from "@/lib/marketplace/marketplace.server";
import { DeleteListingDialog } from "@/components/marketplace/MarketplaceSection";
import { ListingDetail } from "@/components/marketplace/MarketplaceBrowse";
import { KindPill } from "@/components/marketplace/ListingParts";
import { InfoBox, primaryButtonClass, secondaryButtonClass, sectionLabelClass, textInputClass } from "@/components/admin/basics/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LISTING_LIMITS,
  listingDate,
  listingState,
  priceText,
  type MarketplaceCategory,
  type MarketplaceListing,
} from "@/lib/marketplace/marketplace";

const smallButtonClass = cn(secondaryButtonClass, "px-[14px] text-[12px]");
const STATE_LABEL = { open: "Open", closed: "Closed", expired: "Expired" } as const;

/** Guild > Marketplace: the category list, and every listing with Remove. */
export function GuildMarketplace({
  categories,
  listings,
}: {
  categories: MarketplaceCategory[];
  listings: MarketplaceListing[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MarketplaceListing | null>(null);
  const viewing = listings.find((l) => l.id === viewId);
  const now = new Date();

  async function run(action: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      await router.invalidate();
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save — try again.");
      await router.invalidate();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name && (await run(() => saveMarketplaceCategory({ data: { id: null, name } }), `Added "${name}"`))) setNewName("");
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (renaming && (await run(() => saveMarketplaceCategory({ data: renaming }), "Renamed"))) setRenaming(null);
  }

  function move(index: number, by: -1 | 1) {
    const ids = categories.map((c) => c.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void run(() => orderMarketplaceCategories({ data: { ids } }));
  }

  if (viewing) {
    return (
      <ListingDetail
        listing={viewing}
        category={categories.find((c) => c.id === viewing.categoryId)?.name ?? null}
        onBack={() => setViewId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex max-w-[640px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight text-ink">Marketplace</h1>
        <p className="text-[13px] text-ink-muted">
          Producers' classified ads, seen only by Producers and Guild admins. Alcohol isn't allowed: remove any listing
          for it.
        </p>
      </header>

      <section className="flex max-w-[760px] flex-col gap-3" aria-labelledby="market-categories">
        <h2 id="market-categories" className={sectionLabelClass}>
          Categories
        </h2>
        <ul className="overflow-hidden rounded-[14px] border border-[#DED7CB] bg-white">
          {categories.map((c, index) => {
            const used = listings.filter((l) => l.categoryId === c.id).length;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2.5 border-b border-[#F0EBE3] px-4 py-3 last:border-b-0">
                {renaming?.id === c.id ? (
                  <form onSubmit={rename} className="flex w-full flex-wrap gap-2">
                    <Input
                      aria-label={`New name for ${c.name}`}
                      autoFocus
                      value={renaming.name}
                      maxLength={LISTING_LIMITS.category}
                      onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                      className={cn(textInputClass, "min-w-0 flex-1 basis-52")}
                    />
                    <button type="button" className={smallButtonClass} disabled={busy} onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                    <button type="submit" className={primaryButtonClass} disabled={busy || !renaming.name.trim()}>
                      Save
                    </button>
                  </form>
                ) : deletingCategory === c.id ? (
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 basis-52 text-[13px] text-ink">
                      Delete “{c.name}”?{" "}
                      {used > 0
                        ? `${used} ${used === 1 ? "listing stays" : "listings stay"} up with no category.`
                        : "No listings use it."}
                    </p>
                    <button type="button" className={smallButtonClass} disabled={busy} onClick={() => setDeletingCategory(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-11 items-center rounded-[9px] bg-danger px-5 text-[13px] font-semibold text-white disabled:opacity-50"
                      disabled={busy}
                      onClick={async () => {
                        if (await run(() => deleteMarketplaceCategory({ data: { id: c.id } }), "Deleted")) setDeletingCategory(null);
                      }}
                    >
                      Delete category
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 basis-40 text-[14px] font-medium text-ink">
                      {c.name} <span className="text-[12px] font-normal text-ink-muted">({used})</span>
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={cn(smallButtonClass, "px-3")}
                        aria-label={`Move ${c.name} up`}
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ChevronUp aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={cn(smallButtonClass, "px-3")}
                        aria-label={`Move ${c.name} down`}
                        disabled={busy || index === categories.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ChevronDown aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={smallButtonClass}
                        aria-label={`Rename ${c.name}`}
                        disabled={busy}
                        onClick={() => setRenaming({ id: c.id, name: c.name })}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className={smallButtonClass}
                        aria-label={`Delete ${c.name}`}
                        disabled={busy}
                        onClick={() => setDeletingCategory(c.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
          {categories.length === 0 && (
            <li className="px-5 py-8 text-center text-[14px] text-ink-muted">
              No categories yet. Producers can't post until there's at least one.
            </li>
          )}
        </ul>
        <form onSubmit={add} className="flex flex-wrap gap-2.5">
          <Input
            aria-label="New category name"
            value={newName}
            maxLength={LISTING_LIMITS.category}
            placeholder="New category"
            onChange={(e) => setNewName(e.target.value)}
            className={cn(textInputClass, "min-w-0 flex-1 basis-52")}
          />
          <button type="submit" className={primaryButtonClass} disabled={busy || !newName.trim()}>
            Add category
          </button>
        </form>
        <InfoBox>Renaming a category keeps its listings in it.</InfoBox>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="market-listings">
        <h2 id="market-listings" className={sectionLabelClass}>
          All listings ({listings.length})
        </h2>
        <ul className="overflow-hidden rounded-[14px] border border-[#DED7CB] bg-white">
          {listings.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#F0EBE3] px-5 py-4 last:border-b-0">
              <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1.5">
                <KindPill kind={l.kind} />
                <span className="break-words text-[14px] font-semibold text-ink">{l.title}</span>
                <span className="text-[12px] text-ink-muted">
                  {l.memberName} · {priceText(l)} · {STATE_LABEL[listingState(l, now)]} · Posted {listingDate(l.postedAt)}
                  {l.memberStatus !== "published" && " · Profile not published"}
                </span>
              </div>
              <button type="button" className={smallButtonClass} aria-label={`View ${l.title}`} onClick={() => setViewId(l.id)}>
                View
              </button>
              <button
                type="button"
                className={smallButtonClass}
                aria-label={`Remove ${l.title}`}
                disabled={busy}
                onClick={() => setToDelete(l)}
              >
                Remove
              </button>
            </li>
          ))}
          {listings.length === 0 && <li className="px-5 py-8 text-center text-[14px] text-ink-muted">No listings yet.</li>}
        </ul>
      </section>

      <DeleteListingDialog
        listing={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={async (l) => {
          await run(() => deleteListing({ data: { id: l.id } }), "Listing removed");
          setToDelete(null);
        }}
      />
    </div>
  );
}
