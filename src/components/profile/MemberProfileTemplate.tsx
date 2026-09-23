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
 * Mobile-first, genuinely (spec, "Layout and breakpoints": "the phone
 * layout is the design and the wide layout is the adaptation"): below the
 * hero, a single CSS Grid column stacks in the spec's own stated phone
 * order -- status block, media carousel, schedule, link pills, contact --
 * simply by DOM order at the default (single-column) breakpoint. `lg:`
 * utilities on each grid item are what pin the media carousel to a fixed
 * 420px left column and the rest to the column beside it -- this
 * component's own desktop split, not something
 * src/routes/members_.$slug.tsx (Task 18) adds around it.
 *
 * The split is `lg:` (1024px), not `md:` (768px): at exactly 768px the
 * fixed 420px carousel column plus padding/gap leaves column 2 only
 * ~276px wide -- narrower than the ~358px column 2 gets on a 390px phone,
 * which breaks ScheduleChips' 7-day chip row. At 1024px the same
 * arithmetic (1024 - 48px padding - 420px column 1 - 24px gap) leaves
 * column 2 ~532px, comfortably wider than the phone case.
 */
export function MemberProfileTemplate({ data, search }: MemberProfileTemplateProps) {
  const { member, hours, specialHours, events, carouselSlides, links, categories, crossLink, headerPrev, headerNext, logoPublicUrl, coverAsset } = data;
  // Reconstructed from the server's one serialized instant (MemberProfileData.now),
  // never read fresh here -- see that field's own doc comment for why.
  const now = new Date(data.now);

  const weekdayHours = toWeekdayHours(hours);
  const specialHoursDays = toSpecialHoursDay(specialHours);
  const hasCarousel = carouselSlides.length > 0;

  // Mirrors each component's own null condition so its grid-row wrapper
  // is never rendered empty -- an empty grid item still occupies a row
  // and still gets `gap-6` on both sides, which is real, visible dead
  // space (unlike the old flex-col-with-gap layout, where an empty child
  // just collapsed to nothing).
  const scheduleVisible = member.member_type !== "mobile" && weekdayHours.length > 0;
  const visibleEventsCount = events.filter((event) => !event.is_hidden).length;
  const eventsVisible = member.member_type === "mobile" || visibleEventsCount > 0;
  const showScheduleGroup = scheduleVisible || eventsVisible;
  const linksVisible = links.length > 0;
  const contactLocationText = member.member_type === "mobile" ? member.service_area : member.street_address;
  const contactHasEmail = member.member_type === "allied" && Boolean(member.contact_email);
  const contactVisible = Boolean(contactLocationText) || Boolean(member.phone) || contactHasEmail;

  // The carousel (420px wide, aspect-[4/5] slides plus a dot row) is
  // almost always taller than the status group alone, so without an
  // explicit span it just occupies row 1 by itself and pushes every
  // column-2 row below it down by the difference -- a big dead gap under
  // the status group, not a small one. Spanning it across the actual
  // number of visible column-2 rows (not a fixed 4) lets CSS Grid's row
  // sizing distribute that slack across the real rows instead of parking
  // it all in one gap, and keeps the span correct when a row is hidden.
  const contentRows = 1 + Number(showScheduleGroup) + Number(linksVisible) + Number(contactVisible);

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

  // StatusBlock's "Tonight: {venue}" line (producer/Allied Member) is only
  // ever correct for an event actually happening today, in the member's
  // own local day (member.timezone) -- not just "the next upcoming event,
  // whenever that is." Mobile's "Next appearance" line is a separate,
  // deliberately unbounded concern (any future date is fine there), so it
  // keeps using `nextEvent` directly rather than this narrowed value.
  const todayLocalDate = getZonedNow(now, member.timezone).date;
  const nextEventLocalDate = nextEvent
    ? getZonedNow(new Date(nextEvent.overlay_starts_at ?? nextEvent.starts_at), member.timezone).date
    : null;
  const tonightEvent = member.member_type === "mobile" ? nextEvent : nextEventLocalDate === todayLocalDate ? nextEvent : null;

  const coverUrl = coverAsset
    ? `${data.isPreview ? "/api/admin-media" : "/api/member-media"}/${coverAsset.id}`
    : null;

  return (
    <article className="mx-auto max-w-[1120px]">
      {/* HeaderNav sits on the dark site chrome, not the light canvas --
          it uses --text/--text-muted-on-dark tokens (text-text,
          hover:text-brand-bright), which would be near-invisible on
          bg-canvas the same way finding #1 made the hero's text-ink
          near-invisible on dark. It stays outside the canvas wrapper
          below for that reason. */}
      <div className="px-4 pt-4 md:px-6">
        <HeaderNav prev={headerPrev} next={headerNext} search={search} />
      </div>

      {/* The light profile card (spec, "Colour tokens": "the site chrome
          is dark; the profile card is a light canvas, so a member's logo
          and photos sit on neutral ground instead of fighting the
          Guild's brown"). Every text-ink/text-ink-muted element inside
          ProfileHero and the module grid below depends on this ancestor
          actually establishing bg-canvas -- none of them set their own
          background. Rounded only at md+ to match the cover photo's own
          rounded-none (mobile, full-bleed) / md:rounded-card (desktop,
          inset) geometry; overflow-hidden only at md+ so nothing on
          mobile risks an unintended clip. */}
      <div className="bg-canvas md:overflow-hidden md:rounded-card">
        <ProfileHero member={member} coverUrl={coverUrl} logoUrl={logoPublicUrl} />

        <div
          className={
            hasCarousel
              ? "grid grid-cols-1 gap-6 px-4 pb-6 pt-6 md:px-6 md:pb-8 lg:grid-cols-[420px_1fr]"
              : "grid grid-cols-1 gap-6 px-4 pb-6 pt-6 md:px-6 md:pb-8"
          }
        >
          <div className={hasCarousel ? "flex flex-col gap-6 lg:col-start-2" : "flex flex-col gap-6"}>
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
            // lg:order-first (rather than an explicit lg:row-start) makes this
            // item the FIRST one the grid's auto-placement algorithm places at
            // the lg breakpoint -- order-modified document order, not visual
            // order -- so it lands in row 1 of column 1 regardless of coming
            // after the status group in the DOM (required for the phone
            // order). The other column-2 items then auto-place into
            // successive rows with no explicit row numbers at all, so
            // whichever of schedule/links/contact happen to be hidden simply
            // compacts the rest upward -- no manual row bookkeeping, no gaps.
            //
            // The row span itself is a CSS custom property set inline (its
            // value, `contentRows`, is only known at render time, and a
            // dynamically-built class like `lg:row-span-${contentRows}`
            // can't be picked up by Tailwind's build-time JIT scan) that a
            // `lg:`-scoped arbitrary-property utility reads. Scoping the
            // *utility* to `lg:` -- rather than setting `grid-row-end`
            // directly via inline style -- is what keeps this inert below
            // that breakpoint: no rule reads the custom property there, so
            // the item stays a normal single-row grid item (an unscoped
            // inline `grid-row-end` would apply at every width and, in the
            // single-column layout, push every sibling below it down by
            // the same number of rows).
            <div
              className="lg:order-first lg:col-start-1 lg:[grid-row-end:var(--carousel-row-span)]"
              style={{ "--carousel-row-span": `span ${contentRows}` } as CSSProperties}
            >
              <MediaCarousel
                slides={carouselSlides}
                memberName={member.business_name}
                theme={member.theme}
                isPreview={data.isPreview}
              />
            </div>
          )}

          {showScheduleGroup && (
            <div className={hasCarousel ? "flex flex-col gap-6 lg:col-start-2" : "flex flex-col gap-6"}>
              <ScheduleChips hours={weekdayHours} memberType={member.member_type} />
              <EventsModule events={events} memberType={member.member_type} timezone={member.timezone} />
            </div>
          )}

          {linksVisible && (
            <div className={hasCarousel ? "lg:col-start-2" : undefined}>
              <LinkPills links={links} />
            </div>
          )}

          {contactVisible && (
            <div className={hasCarousel ? "lg:col-start-2" : undefined}>
              <ContactBlock member={member} />
            </div>
          )}
        </div>
      </div>

      {crossLink && (
        <div className="mt-8 px-4 md:px-6">
          <CrossLinkCard entry={crossLink} memberType={member.member_type} />
        </div>
      )}
    </article>
  );
}
