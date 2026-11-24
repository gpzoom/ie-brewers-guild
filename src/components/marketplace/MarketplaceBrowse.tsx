import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Mail, Phone } from "lucide-react";
import { KindPill, PhotoFlip } from "@/components/marketplace/ListingParts";
import { Field, primaryButtonClass, secondaryButtonClass, textInputClass } from "@/components/admin/basics/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CONDITION_LABELS,
  contactMailto,
  filterListings,
  KIND_LABELS,
  LISTING_KINDS,
  listingDate,
  listingLocation,
  NO_FILTERS,
  pageOf,
  priceText,
  SORT_LABELS,
  type ListingFilters,
  type ListingKind,
  type MarketplaceCategory,
  type MarketplaceListing,
  type SortKey,
} from "@/lib/marketplace/marketplace";

const selectClass = cn(textInputClass, "w-full border px-3");

/**
 * Browse: filters down the left, wide listing rows on the right (owner's
 * reference, an equipment-auction search page, without the auction).
 * View Details swaps the list for one listing.
 */
export function MarketplaceBrowse({
  listings,
  categories,
}: {
  listings: MarketplaceListing[];
  categories: MarketplaceCategory[];
}) {
  const [filters, setFilters] = useState<ListingFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const found = useMemo(() => filterListings(listings, filters), [listings, filters]);
  const { rows, pages, current, from, to } = pageOf(found, page);
  const open = openId ? listings.find((l) => l.id === openId) : undefined;
  const hasUncategorized = listings.some((l) => l.categoryId === null);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;

  const set = <K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const scrollTop = () => topRef.current?.scrollIntoView({ block: "start" });
  const goTo = (next: number) => {
    setPage(next);
    scrollTop();
  };

  if (open) {
    return (
      <div ref={topRef} className="scroll-mt-6">
        <ListingDetail listing={open} category={categoryName(open.categoryId)} onBack={() => setOpenId(null)} />
      </div>
    );
  }

  return (
    <div ref={topRef} className="flex scroll-mt-6 flex-col gap-5 lg:flex-row lg:items-start">
      <section aria-label="Filters" className="overflow-hidden rounded-[14px] border border-[#DED7CB] bg-white lg:w-[250px] lg:shrink-0">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="market-filters"
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between bg-ink px-4 text-left text-[14px] font-semibold text-canvas lg:hidden"
        >
          Search and filters
          <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
        </button>
        <div className="hidden bg-ink px-4 py-3 text-[14px] font-semibold text-canvas lg:block">Search and filters</div>
        <div id="market-filters" className={cn("flex-col gap-4 p-4 lg:flex", filtersOpen ? "flex" : "hidden")}>
          <Field id="market-keyword" label="Keyword">
            <Input
              id="market-keyword"
              type="search"
              value={filters.keyword}
              placeholder="e.g. fermenter"
              onChange={(e) => set("keyword", e.target.value)}
              className={textInputClass}
            />
          </Field>
          <Field id="market-kind" label="Listing type">
            <select
              id="market-kind"
              value={filters.kind}
              onChange={(e) => set("kind", e.target.value as ListingKind | "")}
              className={selectClass}
            >
              <option value="">All types</option>
              {LISTING_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="market-category" label="Category">
            <select
              id="market-category"
              value={filters.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              className={selectClass}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {hasUncategorized && <option value="none">No category</option>}
            </select>
          </Field>
          <Field id="market-sort" label="Sort by">
            <select
              id="market-sort"
              value={filters.sort}
              onChange={(e) => set("sort", e.target.value as SortKey)}
              className={selectClass}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="market-min" label="Min price">
              <Input
                id="market-min"
                inputMode="decimal"
                value={filters.minPrice}
                placeholder="$"
                onChange={(e) => set("minPrice", e.target.value)}
                className={textInputClass}
              />
            </Field>
            <Field id="market-max" label="Max price">
              <Input
                id="market-max"
                inputMode="decimal"
                value={filters.maxPrice}
                placeholder="$"
                onChange={(e) => set("maxPrice", e.target.value)}
                className={textInputClass}
              />
            </Field>
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setFilters(NO_FILTERS);
              setPage(1);
            }}
          >
            Clear filters
          </button>
        </div>
      </section>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-muted" aria-live="polite">
            {found.length === 0
              ? "No listings"
              : `Showing ${from}–${to} of ${found.length} ${found.length === 1 ? "listing" : "listings"}`}
          </p>
          {pages > 1 && <Pager pages={pages} current={current} onGo={goTo} />}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-[14px] border border-[#DED7CB] bg-white px-5 py-10 text-center text-[14px] text-ink-muted">
            {listings.length === 0
              ? "Nothing is listed yet. Be the first: press Post a listing."
              : "Nothing matches your filters. Try fewer words or clear the filters."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((l) => (
              <li
                key={l.id}
                className="grid gap-4 rounded-[14px] border border-[#DED7CB] bg-white p-4 sm:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_190px]"
              >
                <PhotoFlip listing={l} />
                <div className="flex min-w-0 flex-col gap-2">
                  <KindPill kind={l.kind} />
                  <h2 className="break-words text-[16px] font-semibold leading-snug text-ink">{l.title}</h2>
                  <p className="text-[13px] text-ink-muted">
                    {[l.memberName, listingLocation(l)].filter(Boolean).join(" · ")}
                  </p>
                  <p className="line-clamp-2 break-words text-[13px] leading-[1.5] text-[#3A332C]">{l.description}</p>
                </div>
                <div className="flex flex-col gap-2 sm:col-start-2 xl:col-start-3">
                  <PriceLine listing={l} />
                  <button
                    type="button"
                    className={primaryButtonClass}
                    aria-label={`View details: ${l.title}`}
                    onClick={() => {
                      setOpenId(l.id);
                      scrollTop();
                    }}
                  >
                    View Details
                  </button>
                  <p className="text-[12px] text-ink-muted">Posted {listingDate(l.postedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex justify-end">
            <Pager pages={pages} current={current} onGo={goTo} />
          </div>
        )}
      </div>
    </div>
  );
}

function PriceLine({ listing, large = false }: { listing: MarketplaceListing; large?: boolean }) {
  return (
    <p className={cn("font-semibold text-ink", large ? "text-[22px]" : "text-[16px]")}>
      {priceText(listing)}
      {listing.negotiable && listing.priceCents !== 0 && (
        <span className="block text-[12px] font-normal text-ink-muted">
          {listing.kind === "wanted" ? "Flexible" : "Open to offers"}
        </span>
      )}
    </p>
  );
}

function Pager({ pages, current, onGo }: { pages: number; current: number; onGo: (page: number) => void }) {
  // At most five numbers, around the current page.
  const first = Math.max(1, Math.min(current - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);
  const button = "flex h-11 min-w-11 items-center justify-center border-r border-canvas-border px-3 text-[13px] last:border-r-0 disabled:opacity-40";
  return (
    <nav aria-label="Pages" className="flex overflow-hidden rounded-[9px] border border-canvas-border bg-white">
      <button type="button" className={cn(button, "hidden sm:flex")} disabled={current === 1} onClick={() => onGo(current - 1)}>
        Previous
      </button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Page ${n}`}
          aria-current={n === current ? "page" : undefined}
          className={cn(button, n === current && "bg-ink font-semibold text-canvas")}
          onClick={() => onGo(n)}
        >
          {n}
        </button>
      ))}
      <button type="button" className={cn(button, "hidden sm:flex")} disabled={current === pages} onClick={() => onGo(current + 1)}>
        Next
      </button>
    </nav>
  );
}

export function ListingDetail({
  listing: l,
  category,
  onBack,
}: {
  listing: MarketplaceListing;
  category: string | null;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const facts: [string, string | null][] = [
    ["Category", category],
    ["Condition", l.condition ? CONDITION_LABELS[l.condition] : null],
    ["Location", listingLocation(l)],
    ["Posted", listingDate(l.postedAt)],
    ["Listed until", listingDate(l.expiresAt)],
  ];
  return (
    <article className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className={cn(secondaryButtonClass, "w-fit gap-2")}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to listings
      </button>
      <div className="grid gap-6 rounded-[14px] border border-[#DED7CB] bg-white p-5 lg:grid-cols-2 md:p-6">
        <PhotoFlip listing={l} className="self-start" />
        <div className="flex min-w-0 flex-col gap-4">
          <KindPill kind={l.kind} />
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="break-words font-display text-[24px] font-bold leading-tight text-ink focus:outline-none"
          >
            {l.title}
          </h2>
          <PriceLine listing={l} large />
          <p className="whitespace-pre-line break-words text-[14px] leading-[1.6] text-[#3A332C]">{l.description}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
            {facts.map(([label, value]) =>
              value ? (
                <div key={label} className="contents">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="break-words text-ink">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
          <div className="flex flex-col gap-2.5 border-t border-canvas-2 pt-4">
            <p className="text-[14px] text-ink">
              Contact <strong className="font-semibold">{l.contactName ?? l.memberName}</strong>
              {l.contactName && ` at ${l.memberName}`}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {l.contactEmail && (
                <a href={contactMailto(l.contactEmail, l.title)} className={cn(primaryButtonClass, "gap-2 no-underline")}>
                  <Mail aria-hidden="true" className="h-4 w-4" />
                  Email
                </a>
              )}
              {l.contactPhone && (
                <a href={`tel:${l.contactPhone.replace(/[^\d+,;]/g, "")}`} className={cn(secondaryButtonClass, "gap-2 no-underline")}>
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  {l.contactPhone}
                </a>
              )}
            </div>
            {l.contactEmail && <p className="break-all text-[13px] text-ink-muted">{l.contactEmail}</p>}
            <p className="text-[12px] text-ink-muted">
              You deal with each other directly. The Guild isn't part of the sale and doesn't handle payment.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
