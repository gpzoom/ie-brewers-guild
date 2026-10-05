import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Beer, CalendarDays, Globe, MapPin, Mic, Navigation, Star, Tent, Truck } from "lucide-react";
import type { V2Card } from "@/lib/members/members-v2";
import type { MobileIcon } from "@/lib/members/mobile-category";
import { directionsUrl } from "@/lib/members/directory";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { distanceMiles, formatMiles, orderLocations, splitLocations, type LatLng } from "@/lib/members/directory-filters";
import { cn } from "@/lib/utils";

const STOP_ICON: Record<MobileIcon, typeof Truck> = { truck: Truck, tent: Tent, mic: Mic, star: Star };

export function stopLineText(card: V2Card): string | null {
  const s = card.stop;
  if (!s) return null;
  switch (s.state) {
    case "at-member": return `Today at ${s.hostName} · ${s.time}`;
    case "at-address": return `Today at ${s.venue} · ${s.time}`;
    case "in-city": return s.place ? `Today in ${s.place} · ${s.time}` : `Today · ${s.time}`;
    case "next": return `No stop today. Next: ${s.day}${s.city ? ` · ${s.city}` : ""}`;
    case "none": return "No stops scheduled";
  }
}

function miles(origin: LatLng | null, lat: number | null, lng: number | null): string | null {
  return origin && lat !== null && lng !== null ? formatMiles(distanceMiles(origin, { lat, lng })) : null;
}

const actionClass = "relative z-10 inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground";

export function MemberCardV2(props: {
  card: V2Card;
  linkSearch: DirectorySearch;
  origin: LatLng | null;
  highlighted: boolean;
  focusedSlug: string | null;
  onHoverCard: (key: string | null) => void;
  onHoverLocation: (slug: string | null) => void;
  compact?: boolean;
}) {
  const { card, linkSearch, origin, highlighted } = props;
  const [expanded, setExpanded] = useState(false);
  const first = card.locations[0];
  const multi = card.memberType !== "mobile" && card.locations.length > 1;
  // Near me: the nearest location first, so the row that put this card at the top shows.
  const locations = orderLocations(card.locations, origin);
  const { shown, hidden } = splitLocations(locations);
  const rows = expanded ? locations : shown;
  const StopIcon = card.mobileIcon ? STOP_ICON[card.mobileIcon] : Truck;
  const stopText = stopLineText(card);
  const hasPinToday = card.stopPin !== null;

  const profile = (
    <Link to="/members/$slug" params={{ slug: first.slug }} search={linkSearch} className="relative z-10 inline-flex min-h-8 items-center gap-1.5 text-[13px] font-bold text-primary">
      Profile <span aria-hidden="true">→</span>
    </Link>
  );
  const website = card.website ? (
    <a href={card.website} target="_blank" rel="noreferrer" className={actionClass}>
      <Globe className="h-[15px] w-[15px]" /> Website
    </a>
  ) : null;

  return (
    <article
      data-card-key={card.key}
      onMouseEnter={() => props.onHoverCard(card.key)}
      onMouseLeave={() => props.onHoverCard(null)}
      className={cn(
        "relative flex gap-4 border-b border-border border-l-[3px] px-5 py-[18px] transition-colors",
        highlighted ? "border-l-primary bg-[#2A221B]" : "border-l-transparent",
        props.compact && "px-4 py-4",
      )}
    >
      <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-white", props.compact ? "h-12 w-12" : "h-14 w-14")}>
        {card.logo ? <img src={card.logo} alt="" className="h-full w-full object-contain" loading="lazy" /> : <Beer className="h-6 w-6 text-primary" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {card.tag && (
          <span className={cn("inline-flex h-5 w-fit items-center rounded-full px-2 text-[10px] font-bold tracking-[0.08em]", card.memberType === "allied" ? "bg-[#E6E3F3] text-[#3B4B9A]" : "bg-[#DCEDEC] text-[#17605F]")}>
            {card.tag}
          </span>
        )}
        <Link to="/members/$slug" params={{ slug: first.slug }} search={linkSearch} className="font-display text-base font-extrabold uppercase leading-tight text-foreground after:absolute after:inset-0 hover:underline">
          {card.name}
        </Link>

        {card.memberType === "mobile" ? (
          <>
            <p className="flex gap-2 text-[13px] leading-snug text-foreground">
              <StopIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{stopText}</span>
            </p>
            {card.stop?.state === "at-address" && card.stop.address && (
              <p className="pl-[22px] text-xs text-muted-foreground">{card.stop.address}</p>
            )}
          </>
        ) : multi ? (
          <>
            <p className="text-xs text-muted-foreground">{card.locations.length} locations</p>
            <ul className="-ml-2.5 mt-1 flex flex-col gap-0.5">
              {rows.map((l) => {
                const d = miles(origin, l.lat, l.lng);
                const focused = props.focusedSlug === l.slug;
                return (
                  <li
                    key={l.slug}
                    onMouseEnter={() => props.onHoverLocation(l.slug)}
                    onMouseLeave={() => props.onHoverLocation(null)}
                    className={cn("relative z-10 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px]", focused && "bg-[#2A221B]")}
                  >
                    <MapPin className={cn("h-3.5 w-3.5 shrink-0", focused ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      <Link to="/members/$slug" params={{ slug: l.slug }} search={linkSearch} className="font-semibold text-foreground hover:underline">{l.city}</Link>
                      {l.street ? ` · ${l.street}` : ""}
                      {d && <span className="font-semibold text-primary"> · {d}</span>}
                    </span>
                    <a href={directionsUrl(l)} target="_blank" rel="noreferrer" aria-label={`Directions to ${card.name}, ${l.city}`} className="text-muted-foreground hover:text-foreground">
                      <Navigation className="h-[15px] w-[15px]" />
                    </a>
                  </li>
                );
              })}
              {hidden.length > 0 && !expanded && (
                <li>
                  <button type="button" onClick={() => setExpanded(true)} className="relative z-10 px-2.5 py-1.5 text-[13px] font-semibold text-primary">
                    + {hidden.length} more location{hidden.length === 1 ? "" : "s"}
                  </button>
                </li>
              )}
            </ul>
          </>
        ) : (
          <p className="flex gap-2 text-[13px] leading-snug text-muted-foreground" onMouseEnter={() => props.onHoverLocation(first.slug)} onMouseLeave={() => props.onHoverLocation(null)}>
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {[first.street, first.city].filter(Boolean).join(", ") || first.address}
              {miles(origin, first.lat, first.lng) && <span className="font-semibold text-primary"> · {miles(origin, first.lat, first.lng)}</span>}
            </span>
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
          {card.memberType === "mobile" && !hasPinToday ? (
            <Link to="/members/$slug" params={{ slug: first.slug }} search={linkSearch} className={actionClass}>
              <CalendarDays className="h-[15px] w-[15px]" /> Schedule
            </Link>
          ) : !multi ? (
            <a href={card.memberType === "mobile" && card.stopPin ? `https://www.google.com/maps/dir/?api=1&destination=${card.stopPin.lat},${card.stopPin.lng}` : directionsUrl(first)} target="_blank" rel="noreferrer" className={actionClass}>
              <Navigation className="h-[15px] w-[15px]" /> Directions
            </a>
          ) : null}
          {/* The phone map's swipe cards stay short: Website is on the profile and in the list. */}
          {!props.compact && website}
          {profile}
        </div>
      </div>
    </article>
  );
}
