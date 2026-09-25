import type { CSSProperties } from "react";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { StatusBlock } from "@/components/profile/StatusBlock";
import { ScheduleChips } from "@/components/profile/ScheduleChips";
import { EventsModule } from "@/components/profile/EventsModule";
import { DiscountBlock } from "@/components/profile/DiscountBlock";
import { CategoryChips } from "@/components/profile/CategoryChips";
import { LinkPills } from "@/components/profile/LinkPills";
import { ContactBlock } from "@/components/profile/ContactBlock";
import { MediaCarousel } from "@/components/profile/MediaCarousel";
import { CrossLinkCard } from "@/components/profile/CrossLinkCard";
import { HeaderNav } from "@/components/profile/HeaderNav";
import type { MemberProfileData } from "@/lib/members/member-profile.server";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { getZonedNow, type SpecialHoursDay, type WeekdayHours } from "@/lib/hours/open-now";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";
import { isHttpUrl } from "@/lib/links/url-safety";

type MemberProfileTemplateProps = {
  data: MemberProfileData;
  search: DirectorySearch;
};

// getMemberProfileData (Task 10) returns the raw snake_case DB rows;
// computeOpenNow/StatusBlock/ScheduleChips (Task 7/13/14) were built
// against the camelCase WeekdayHours/SpecialHoursDay shapes. This
// template is the one place those two sides meet, so it's the one place
// that has to bridge them.
function toWeekdayHours(rows: HoursRow[]): WeekdayHours[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    closesNextDay: row.closes_next_day,
    isClosed: row.is_closed,
  }));
}

function toSpecialHoursDay(rows: SpecialHoursRow[]): SpecialHoursDay[] {
  return rows.map((row) => ({
    date: row.date,
    isClosed: row.is_closed,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    closesNextDay: row.closes_next_day,
    note: row.note,
  }));
}

/**
 * ONE template, switched by member_type at the module level -- never
 * forked into three templates (spec, "Member types": "Build it that way
 * from the start -- forking the template per type is the failure mode").
 *
 * Visual reference: artboards D (producer), E (mobile) and V (Allied
 * Member) on the phone, L on desktop (docs/design/). The dark site ground
 * holds the edges -- the directory bar above, the cross-link card below --
 * and the light profile card owns the middle. The card carries
 * `theme-canvas` (src/styles.css) so its headings take the canvas's
 * sentence-case Bricolage treatment rather than the public site's
 * uppercase one.
 *
 * Mobile-first, genuinely (spec, "Layout and breakpoints"): below the
 * hero, a single column stacks in the phone order -- status block
 * (+ discount and categories for an Allied Member), media carousel,
 * schedule, events, link pills, contact -- simply by DOM order. From `lg`
 * (1024px) the carousel takes a fixed 420px left column and everything
 * else stacks beside it (artboard L). `lg`, not `md`: at 768px the 420px
 * column would leave the week chips narrower than on a 390px phone.
 */
export function MemberProfileTemplate({ data, search }: MemberProfileTemplateProps) {
  const { member, hours, specialHours, events, carouselSlides, links, categories, crossLink, headerPrev, headerNext, headerPosition, crossLinkLogoUrl, nextLocation, logoPublicUrl, coverAsset } = data;
  // Reconstructed from the server's one serialized instant (MemberProfileData.now),
  // never read fresh here -- see that field's own doc comment for why.
  const now = new Date(data.now);

  const weekdayHours = toWeekdayHours(hours);
  const specialHoursDays = toSpecialHoursDay(specialHours);
  const hasCarousel = carouselSlides.length > 0;

  // Mirrors each component's own null condition so no grid row is ever
  // rendered empty -- an empty grid item still occupies a row and gets
  // the row gap on both sides, which is real, visible dead space.
  const scheduleVisible = member.member_type !== "mobile" && weekdayHours.length > 0;
  const visibleEventsCount = events.filter((event) => !event.is_hidden).length;
  const eventsVisible = member.member_type === "mobile" || visibleEventsCount > 0;
  const linksVisible = links.some((link) => isHttpUrl(link.url));
  const contactLocationText = member.member_type === "mobile" ? member.service_area : member.street_address;
  const contactHasEmail = member.member_type === "allied" && Boolean(member.contact_email);
  const contactVisible = Boolean(contactLocationText) || Boolean(member.phone) || contactHasEmail;

  // Desktop two-column grid: the right column's items each take one
  // auto-sized row; the carousel spans ALL of them plus one trailing 1fr
  // row. A spanning item that crosses a flexible track leaves the auto
  // rows at their content height and pushes its extra height into that
  // fr row -- so a carousel taller than the right column never opens gaps
  // between the right column's own modules. Set as a CSS custom property
  // read by an `lg:`-scoped utility (the count is only known at render
  // time), so it's inert below lg, where the grid is one plain column.
  const contentRows = 1 + Number(scheduleVisible) + Number(eventsVisible) + Number(linksVisible) + Number(contactVisible);

  // Candidates for "next"/"tonight": excludes postponed and canceled (a
  // postponed event has no new date to show, and a canceled one is never
  // "next"), AND excludes is_hidden (a member-hidden event, matching
  // EventsModule's own filter). The public RLS policy on `events`
  // (migration 20260922153458_final_review_fixes.sql, section 2) already
  // adds `and not events.is_hidden`, so a hidden event never reaches this
  // component's data in the first place -- this filter is defense-in-depth
  // alongside that RLS predicate, not the only thing standing between a
  // hidden event and it rendering here. Sorted by the EFFECTIVE start
  // (overlay-aware), not the raw starts_at the query was ordered by
  // server-side -- a rescheduled event can sort out of starts_at order
  // (e.g. moved earlier than another event that was already ahead of it).
  //
  // No additional "hasn't started yet" check runs here on top of the
  // sort: `events` (from getMemberProfileData) is already filtered
  // server-side to events whose EFFECTIVE END hasn't passed (or that are
  // canceled). Every candidate remaining after excluding postponed/
  // canceled above is therefore guaranteed to still be current -- either
  // upcoming or actively in progress right now -- so the earliest one by
  // effective start IS "next"/"tonight", including a mobile member's only
  // event happening at this exact moment (started in the past, not yet
  // ended). Re-filtering by effective start here (as a previous version
  // of this code did) would incorrectly drop an in-progress event back
  // out, showing "No dates announced yet" while the member is literally
  // mid-event.
  const effectiveStart = (event: (typeof events)[number]) =>
    new Date(event.overlay_starts_at ?? event.starts_at).getTime();
  const nextEventCandidates = events
    .filter(
      (event) =>
        !event.is_hidden && event.overlay_status !== "postponed" && event.overlay_status !== "canceled",
    )
    .sort((a, b) => effectiveStart(a) - effectiveStart(b));
  const nextEvent = nextEventCandidates[0] ?? null;

  // StatusBlock's "Tonight —" line (producer) is only ever correct for an
  // event actually happening today, in the member's own local day
  // (member.timezone) -- not just "the next upcoming event, whenever that
  // is." Mobile's "Next appearance" is a separate, deliberately unbounded
  // concern (any future date is fine there), so it keeps using
  // `nextEvent` directly rather than this narrowed value.
  const todayLocalDate = getZonedNow(now, member.timezone).date;
  const nextEventLocalDate = nextEvent
    ? getZonedNow(new Date(nextEvent.overlay_starts_at ?? nextEvent.starts_at), member.timezone).date
    : null;
  const tonightEvent = member.member_type === "mobile" ? nextEvent : nextEventLocalDate === todayLocalDate ? nextEvent : null;

  const coverUrl = coverAsset
    ? `${data.isPreview ? "/api/admin-media" : "/api/member-media"}/${coverAsset.id}`
    : null;

  // With a carousel, every right-column item pins to column 2 at lg.
  const col2 = hasCarousel ? "lg:col-start-2" : undefined;

  return (
    // 10px of dark ground either side of the card on a phone (artboards
    // D/E/V); 24px on a tablet; at 1168px and up the card reaches its
    // 1120px cap (artboard L) and centers.
    <article className="mx-auto w-full max-w-[1168px] px-2.5 pb-10 md:px-6 md:pb-14">
      <HeaderNav prev={headerPrev} next={headerNext} position={headerPosition} search={search} />

      {/* The light profile card (spec, "Color tokens": "the site chrome
          is dark; the profile card is a light canvas, so a member's logo
          and photos sit on neutral ground instead of fighting the
          Guild's brown"). Every text-ink element inside depends on this
          ancestor establishing bg-canvas. */}
      <div className="theme-canvas overflow-hidden rounded-[22px] bg-canvas text-ink md:rounded-3xl">
        <ProfileHero member={member} coverUrl={coverUrl} logoUrl={logoPublicUrl} nextLocation={nextLocation} search={search} />

        <div
          className={
            hasCarousel
              ? "grid grid-cols-1 gap-[18px] px-4 pb-[22px] pt-[18px] md:px-10 md:pb-10 md:pt-7 lg:pb-4 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-6 lg:[grid-template-rows:var(--profile-rows)]"
              : "grid grid-cols-1 gap-[18px] px-4 pb-[22px] pt-[18px] md:px-10 md:pb-10 md:pt-7 lg:gap-y-6"
          }
          style={{ "--profile-rows": `repeat(${contentRows}, auto) 1fr` } as CSSProperties}
        >
          <div className={`flex flex-col gap-[18px] lg:gap-6 ${col2 ?? ""}`}>
            <StatusBlock
              member={member}
              hours={weekdayHours}
              specialHours={specialHoursDays}
              tonightEvent={tonightEvent}
              now={now}
            />
            <DiscountBlock member={member} />
            <CategoryChips categories={categories} />
          </div>

          {hasCarousel && (
            // lg:order-first makes this the FIRST item the grid's
            // auto-placement places at lg (order-modified document order),
            // so it lands in column 1 from row 1 despite following the
            // status group in the DOM (required for the phone order).
            // `lg:[grid-row:1/-1]` spans every explicit row, including the
            // trailing 1fr one described above. Between md and lg (one
            // column, but tablet-wide) it keeps the desktop's 420px slot,
            // centered, rather than a 4:5 photo taller than the screen.
            <div className="w-full md:mx-auto md:max-w-[420px] lg:order-first lg:col-start-1 lg:[grid-row:1/-1]">
              <MediaCarousel
                slides={carouselSlides}
                memberName={member.business_name}
                theme={member.theme}
                isPreview={data.isPreview}
              />
            </div>
          )}

          {scheduleVisible && (
            <div className={col2}>
              <ScheduleChips
                hours={weekdayHours}
                memberType={member.member_type}
                hoursConfirmedAt={member.hours_confirmed_at}
                timezone={member.timezone}
                now={now}
              />
            </div>
          )}

          {eventsVisible && (
            <div className={col2}>
              <EventsModule events={events} memberType={member.member_type} timezone={member.timezone} />
            </div>
          )}

          {linksVisible && (
            <div className={col2}>
              <LinkPills links={links} />
            </div>
          )}

          {contactVisible && (
            <div className={col2}>
              <ContactBlock member={member} />
            </div>
          )}
        </div>
      </div>

      {crossLink && (
        <div className="pt-5 md:pt-7">
          <CrossLinkCard
            entry={crossLink}
            memberType={member.member_type}
            logoUrl={crossLinkLogoUrl}
            logoBackground={data.crossLinkLogoBackground}
          />
        </div>
      )}
    </article>
  );
}
