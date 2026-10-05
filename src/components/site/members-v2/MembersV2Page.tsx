/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Crosshair, List, Map as MapIcon, Search, SlidersHorizontal, X } from "lucide-react";
import type { V2Card, V2Pin } from "@/lib/members/members-v2";
import type { MemberType } from "@/lib/supabase/types";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { filterCards, orderByDistance, type LatLng } from "@/lib/members/directory-filters";
import { MemberCardV2 } from "./MemberCardV2";
import { MembersV2Map } from "./MembersV2Map";
import { FiltersSheet } from "./FiltersSheet";
import { useNearMe } from "./useNearMe";
import { cn } from "@/lib/utils";
import { nearestScrollTop, pickVisible } from "./reveal";

function pointsOf(card: V2Card): LatLng[] {
  if (card.memberType === "mobile") return card.stopPin ? [card.stopPin] : [];
  return card.locations.flatMap((l) => (l.lat !== null && l.lng !== null ? [{ lat: l.lat, lng: l.lng }] : []));
}

export function visibleCards(cards: V2Card[], opts: { query: string; type?: MemberType; origin: LatLng | null }): V2Card[] {
  const filtered = filterCards(cards, { query: opts.query, type: opts.type });
  return opts.origin
    ? orderByDistance(filtered, opts.origin, pointsOf, (c) => c.name)
    : [...filtered].sort((a, b) => a.name.localeCompare(b.name));
}

export function MembersV2Page(props: { cards: V2Card[]; pins: V2Pin[]; search: DirectorySearch }) {
  const navigate = useNavigate({ from: "/members" });
  const [query, setQuery] = useState("");
  const [hoverCard, setHoverCard] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const near = useNearMe();
  const type = props.search.filter;

  const cards = useMemo(() => visibleCards(props.cards, { query, type, origin: near.origin }), [props.cards, query, type, near.origin]);
  const shownKeys = useMemo(() => new Set(cards.map((c) => c.key)), [cards]);
  const pins = useMemo(() => props.pins.filter((p) => shownKeys.has(p.cardKey)), [props.pins, shownKeys]);
  const memberCount = cards.length;
  const locationCount = cards.reduce((n, c) => n + (c.memberType === "mobile" ? 0 : c.locations.length), 0);

  const setType = (next: MemberType | undefined) =>
    navigate({ search: (prev) => ({ ...prev, filter: next }), replace: true, resetScroll: false });

  // Hovering or clicking a pin scrolls the list to its card.
  const revealCard = (key: string | null) => {
    setHoverCard(key);
    if (!key) return;
    const node = pickVisible([...document.querySelectorAll<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`)]);
    const list = node?.closest<HTMLElement>("[data-members-list]");
    if (node && list) {
      // Desktop: scroll the list only, never the page.
      const top = node.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      list.scrollTo({ top: nearestScrollTop({ top, height: node.offsetHeight }, { scrollTop: list.scrollTop, height: list.clientHeight }), behavior: "smooth" });
    } else {
      node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    // Phone map view: bring the pin's card into the swipe rail.
    document.querySelector(`[data-rail-key="${CSS.escape(key)}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  const initialView =
    props.search.mapLat !== undefined && props.search.mapLng !== undefined && props.search.mapZoom !== undefined
      ? { lat: props.search.mapLat, lng: props.search.mapLng, zoom: props.search.mapZoom }
      : undefined;
  const onViewChange = (v: { lat: number; lng: number; zoom: number }) =>
    navigate({ search: (prev) => ({ ...prev, mapLat: v.lat, mapLng: v.lng, mapZoom: v.zoom }), replace: true, resetScroll: false });

  const nearButton = (
    <button
      type="button"
      onClick={() => (near.status === "on" ? near.turnOff() : near.turnOn())}
      aria-pressed={near.status === "on"}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[13px] font-semibold lg:h-[46px] lg:gap-2 lg:rounded-[10px] lg:px-3.5 lg:text-sm",
        near.status === "on" ? "border-primary bg-primary/15 text-primary" : "border-border",
      )}
    >
      <Crosshair className="h-4 w-4" /> {near.status === "asking" ? "Finding you…" : "Near me"}
    </button>
  );
  const searchBox = (
    <label className="flex h-11 flex-1 items-center gap-2.5 rounded-[10px] border border-border bg-[#211C17] px-3 lg:h-[46px]">
      <Search className="h-4 w-4 text-muted-foreground" />
      <span className="sr-only">Search members</span>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members…" className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground lg:text-sm" />
      {query && (
        <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </label>
  );
  const blockedNote =
    near.status === "blocked" ? (
      <p className="flex gap-3 bg-[#2A221B] px-5 py-4 text-sm leading-relaxed">
        <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        We couldn’t get your location, so the list stays A–Z. To use Near me, allow location for this site in your browser’s settings.
      </p>
    ) : null;
  const empty =
    cards.length === 0 ? (
      <div className="flex flex-col items-center gap-2.5 px-6 py-9 text-center">
        <Search className="h-7 w-7 text-muted-foreground" />
        <p className="font-semibold">No members match “{query.trim() || "your filters"}”.</p>
        <p className="text-sm text-muted-foreground">Check the spelling, or</p>
        <button type="button" onClick={() => { setQuery(""); setType(undefined); near.turnOff(); }} className="text-sm font-semibold text-primary underline underline-offset-4">
          clear the search and filters
        </button>
      </div>
    ) : null;
  const list = cards.map((card) => (
    <MemberCardV2
      key={card.key}
      card={card}
      linkSearch={props.search}
      origin={near.origin}
      highlighted={hoverCard === card.key}
      focusedSlug={focusedSlug}
      onHoverCard={setHoverCard}
      onHoverLocation={setFocusedSlug}
    />
  ));
  const map = (className: string, fitPadding?: google.maps.Padding) => (
    <MembersV2Map
      pins={pins}
      highlightCard={hoverCard}
      focusedSlug={focusedSlug}
      onPinHover={revealCard}
      onPinClick={(p) => revealCard(p.cardKey)}
      linkSearch={props.search}
      initialView={initialView}
      onViewChange={onViewChange}
      className={className}
      fitPadding={fitPadding}
    />
  );

  return (
    <>
      {/* Heading: the new top of the page (no photo banner). */}
      <section className="border-b border-border px-4 pb-4 pt-6 lg:flex lg:items-end lg:justify-between lg:gap-10 lg:px-12 lg:pb-6 lg:pt-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary lg:text-xs">Find a member</p>
          <h1 className="mt-1.5 text-[26px] lg:text-[38px]">Members on the map.</h1>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground lg:max-w-[470px] lg:text-right lg:text-[15px]">
          <span className="lg:hidden">Search by name, or see who is near you.</span>
          <span className="hidden lg:inline">The independent producers, mobile members and Allied Members behind the Guild. Point at a member to find them on the map; click for their profile.</span>
        </p>
      </section>

      {/* Desktop: list beside the map (B2). */}
      <div className="hidden lg:flex lg:h-[calc(100dvh-73px)]">
        <div className="flex w-[440px] shrink-0 flex-col border-r border-border">
          <div className="flex flex-col gap-2.5 border-b border-border px-5 pb-3 pt-[18px]">
            <div className="flex gap-2.5">{searchBox}{nearButton}</div>
            <div className="flex gap-2.5">
              <select aria-label="Member type" value={type ?? ""} onChange={(e) => setType((e.target.value || undefined) as MemberType | undefined)} className="h-[46px] flex-1 rounded-[10px] border border-border bg-[#211C17] px-3.5 text-sm">
                <option value="">All member types</option>
                <option value="producer">Producers</option>
                <option value="mobile">Mobile members</option>
                <option value="allied">Allied Members</option>
              </select>
              <select aria-label="Order" value={near.status === "on" ? "near" : "az"} onChange={(e) => (e.target.value === "near" ? near.turnOn() : near.turnOff())} className="h-[46px] w-[150px] rounded-[10px] border border-border bg-[#211C17] px-3.5 text-sm">
                <option value="az">A–Z</option>
                <option value="near">Nearest</option>
              </select>
            </div>
            <p className="pt-0.5 text-xs text-muted-foreground">
              {memberCount} member{memberCount === 1 ? "" : "s"} · {locationCount} location{locationCount === 1 ? "" : "s"}
            </p>
          </div>
          {blockedNote}
          <div data-members-list className="flex-1 overflow-y-auto">{empty}{list}</div>
        </div>
        {map("min-w-0 flex-1 [&>div]:h-full")}
      </div>

      {/* Phone and tablet (B3-B5). */}
      <div className="overflow-x-clip lg:hidden">
        <div className="sticky top-[73px] z-20 flex flex-col gap-2.5 border-b border-border bg-background px-4 pb-3 pt-2.5">
          {searchBox}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 text-[13px] font-semibold">
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {(type || near.status === "on") && (
                <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                  {(type ? 1 : 0) + (near.status === "on" ? 1 : 0)}
                </span>
              )}
            </button>
            {nearButton}
            <div className="ml-auto flex shrink-0 rounded-full border border-border p-[3px]">
              {(["list", "map"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={phoneView === v} onClick={() => setPhoneView(v)} className={cn("inline-flex h-[34px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-semibold", phoneView === v ? "bg-foreground text-background" : "text-muted-foreground")}>
                  {v === "list" ? <List className="h-[15px] w-[15px]" /> : <MapIcon className="h-[15px] w-[15px]" />}
                  {v === "list" ? "List" : "Map"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {blockedNote}
        {phoneView === "list" ? (
          <div>
            <p className="px-4 pt-2.5 text-xs text-muted-foreground">
              {near.status === "on" ? "Nearest first · " : ""}{memberCount} member{memberCount === 1 ? "" : "s"}
            </p>
            {empty}{list}
          </div>
        ) : (
          <PhoneMapView cards={cards} pins={pins} map={map} onFocusCard={(key) => { setHoverCard(key); setFocusedSlug(null); }} linkSearch={props.search} origin={near.origin} />
        )}
        <FiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          type={type}
          nearest={near.status === "on"}
          countFor={(t) => visibleCards(props.cards, { query, type: t, origin: null }).length}
          onApply={(next) => {
            setType(next.type);
            if (next.nearest && near.status !== "on") near.turnOn();
            if (!next.nearest && near.status === "on") near.turnOff();
          }}
        />
      </div>
    </>
  );
}

/** B5: the map fills the screen; cards swipe along the bottom and move the map to their pin. */
function PhoneMapView(props: {
  cards: V2Card[];
  pins: V2Pin[];
  map: (className: string, fitPadding?: google.maps.Padding) => ReactElement;
  onFocusCard: (key: string) => void;
  linkSearch: DirectorySearch;
  origin: LatLng | null;
}) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const key = best?.target.getAttribute("data-rail-key");
        if (key) props.onFocusCard(key);
      },
      { root: el, threshold: [0.6] },
    );
    el.querySelectorAll("[data-rail-key]").forEach((n) => io.observe(n));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe when the cards change
  }, [props.cards]);
  return (
    <div className="relative h-[calc(100dvh-73px-118px)]">
      {props.map("absolute inset-0 [&>div]:h-full", { top: 30, right: 30, bottom: 230, left: 30 })}
      <div ref={rail} className="absolute inset-x-0 bottom-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {props.cards.map((card) => (
          <div key={card.key} data-rail-key={card.key} className="w-[85%] shrink-0 snap-center overflow-hidden rounded-[14px] border border-border bg-[#1E1915] shadow-xl">
            <MemberCardV2 card={card} linkSearch={props.linkSearch} origin={props.origin} highlighted={false} focusedSlug={null} onHoverCard={() => {}} onHoverLocation={() => {}} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
