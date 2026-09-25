import type { ReactNode } from "react";
import { computeOpenNow, type OpenNowResult, type SpecialHoursDay, type WeekdayHours } from "@/lib/hours/open-now";
import type { EventRow, MemberRow } from "@/lib/supabase/types";
import { getMemberThemeHex } from "@/lib/theme/member-themes";

type StatusBlockProps = {
  member: MemberRow;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
  tonightEvent: EventRow | null; // the earliest non-postponed/canceled event starting today, if any
  // Server-computed instant (MemberProfileData.now, reconstructed by the
  // caller), not read fresh here via `new Date()`/`Date.now()`. Cloudflare
  // Workers render in UTC and the visitor's browser renders in its own
  // local zone -- either reading its own clock at render time would
  // produce a different string on the server than on the client, a
  // guaranteed SSR/hydration mismatch on top of it also being wrong (open
  // status must be computed in the member's OWN timezone, not the
  // server's or the visitor's).
  now: Date;
};

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="lg:h-4 lg:w-4">
      <path d="M8 14.5S13 10 13 6.5a5 5 0 1 0-10 0C3 10 8 14.5 8 14.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8" cy="6.4" r="1.9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M5.2 2.4 6.7 5 5.4 6.6c.7 1.6 1.9 2.8 3.5 3.5L10.5 8.8 13 10.3v2.4c0 .6-.5 1.1-1.1 1C6.2 13.3 2.4 9.5 1.8 3.9a1 1 0 0 1 1-1.1h2.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function mapsDirectionsUrl(member: MemberRow): string | null {
  if (!member.street_address) return null;
  const query = `${member.street_address}, ${member.city}, ${member.state}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

function formatAppearance(iso: string, timezone: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone });
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })
    .replace(":00", "")
    .toLowerCase();
  return `${day} · ${time}`;
}

type Action = { href: string; label: ReactNode; external?: boolean };

/**
 * The dark status card (artboards D/E/V/L): a big status line, one or two
 * quiet lines, then the primary action in the member's theme color and a
 * Call button. Switched per the spec's "Member types" table -- producer
 * and Allied Member show open/closed ("Hours not listed", with the phone
 * as the action, when there are no hours at all); mobile shows the next
 * appearance instead, since mobile members have no weekly hours.
 *
 * Primary actions (spec): Directions (producer, to maps), Book us (mobile,
 * the booking phone -- so no second Call button), Request a quote (Allied
 * Member, by email to their sales address when they list one).
 */
export function StatusBlock({ member, hours, specialHours, tonightEvent, now }: StatusBlockProps) {
  const hasHours = hours.length > 0 || specialHours.length > 0;
  const openNow: OpenNowResult = hasHours
    ? computeOpenNow({ now, timezone: member.timezone, hours, specialHours })
    : { status: "unknown" };
  const themeHex = getMemberThemeHex(member.theme);
  const tel = member.phone ? `tel:${member.phone}` : null;

  let label: string | null = null;
  let heading: ReactNode;
  const lines: ReactNode[] = [];
  let primary: Action | null = null;
  let secondary: Action | null = null;

  if (member.member_type === "mobile") {
    label = "Next appearance";
    if (tonightEvent) {
      heading = formatAppearance(tonightEvent.overlay_starts_at ?? tonightEvent.starts_at, member.timezone);
      const place = [tonightEvent.venue_name ?? member.service_area, tonightEvent.city].filter(Boolean).join(" — ");
      if (place) lines.push(place);
    } else {
      heading = "No dates announced yet";
    }
    if (tel) primary = { href: tel, label: "Book us" };
  } else {
    if (openNow.status === "unknown") {
      heading = "Hours not listed";
    } else if (openNow.status === "open") {
      heading = (
        <span className="flex items-center gap-[9px] lg:gap-[11px]">
          <span className="block h-[9px] w-[9px] shrink-0 rounded-full bg-[#6FAE45] lg:h-[11px] lg:w-[11px]" aria-hidden="true" />
          Open now
        </span>
      );
      lines.push(`Closes ${openNow.closesAtLabel} · ${openNow.remainingLabel} left`);
    } else {
      heading = "Closed";
      if (openNow.nextOpenLabel) lines.push(openNow.nextOpenLabel);
    }
    // A special_hours note (holiday, one-off change) renders beside the
    // status (spec, "Computing 'open now'", rule 2).
    if (openNow.status !== "unknown" && openNow.note) lines.push(openNow.note);

    // Second line, per the spec's "Member types" table: producers get
    // tonight's event; Allied Members get service area and lead time.
    if (member.member_type === "allied") {
      const parts = [
        member.service_area ? `Serves ${member.service_area}` : null,
        member.lead_time ? `${member.lead_time} typical lead time` : null,
      ].filter(Boolean);
      if (parts.length) lines.push(parts.join(" · "));
      if (member.contact_email) {
        primary = {
          href: `mailto:${member.contact_email}?subject=${encodeURIComponent("Quote request")}`,
          label: "Request a quote",
        };
      }
    } else {
      if (tonightEvent) lines.push(`Tonight — ${tonightEvent.title ?? tonightEvent.venue_name ?? "on tap"}`);
      const directions = mapsDirectionsUrl(member);
      if (directions) {
        primary = {
          href: directions,
          external: true,
          label: (
            <>
              <PinIcon />
              <span className="lg:hidden">Directions</span>
              <span className="hidden lg:inline">Get directions</span>
            </>
          ),
        };
      }
    }
    if (tel) {
      secondary = {
        href: tel,
        label: (
          <>
            <PhoneIcon className="lg:h-4 lg:w-4" />
            {/* "Hours not listed": the phone number itself is the action (spec). */}
            {openNow.status === "unknown" ? member.phone : "Call"}
          </>
        ),
      };
    }
  }

  const buttonBase =
    "flex h-[46px] flex-1 items-center justify-center gap-[7px] rounded-[11px] px-3 text-sm lg:h-[50px] lg:flex-none lg:gap-[9px] lg:px-6 lg:text-[15px]";

  return (
    <div className="flex flex-col gap-[11px] rounded-2xl bg-ink px-4 py-[17px] lg:gap-[13px] lg:rounded-[18px] lg:px-6 lg:py-[22px]">
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A89D8E] lg:text-[11px]">{label}</p>
      )}
      <p className="font-display text-[25px] leading-[1.05] text-canvas lg:text-[30px]">{heading}</p>
      {lines.map((line, index) => (
        <p key={index} className="text-pretty text-[13px] text-[#CFC6B6] lg:text-[15px]">
          {line}
        </p>
      ))}
      {(primary || secondary) && (
        <div className="flex gap-[9px] pt-[5px] lg:gap-[11px] lg:pt-1.5">
          {primary && (
            <a
              href={primary.href}
              {...(primary.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className={`${buttonBase} font-semibold text-white hover:brightness-110`}
              style={{ backgroundColor: themeHex }}
            >
              {primary.label}
            </a>
          )}
          {secondary && (
            <a
              href={secondary.href}
              className={`${buttonBase} border border-[#4A4238] font-medium text-canvas hover:border-[#6B6156]`}
            >
              {secondary.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
