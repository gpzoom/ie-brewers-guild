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
 * simply by DOM order at the default (single-column) breakpoint. `md:`
 * utilities on each grid item are what pin the media carousel to a fixed
 * 420px left column and the rest to the column beside it -- this
 * component's own desktop split, not something
 * src/routes/members.$slug.tsx (Task 18) adds around it.
 */
export function MemberProfileTemplate({ data, search }: MemberProfileTemplateProps) {
  const { member, hours, specialHours, events, carouselSlides, links, categories, crossLink, headerPrev, headerNext, logoPublicUrl, coverAsset } = data;

  const weekdayHours = toWeekdayHours(hours);
  const specialHoursDays = toSpecialHoursDay(specialHours);
  const hasCarousel = carouselSlides.length > 0;

  const now = new Date();
  const nextEvent =
    events.find((event) => {
      if (event.overlay_status === "postponed" || event.overlay_status === "canceled") return false;
      const startsAt = new Date(event.overlay_starts_at ?? event.starts_at).getTime();
      return startsAt >= now.getTime();
    }) ?? null;

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

  const coverUrl = coverAsset ? `/api/member-media/${coverAsset.id}` : null;

  return (
    <article className="mx-auto max-w-[1120px]">
      {(headerPrev || headerNext) && (
        <div className="px-4 pt-4 md:px-6">
          <HeaderNav prev={headerPrev} next={headerNext} search={search} />
        </div>
      )}

      <ProfileHero member={member} coverUrl={coverUrl} logoUrl={logoPublicUrl} />

      <div
        className={
          hasCarousel
            ? "mt-6 grid grid-cols-1 gap-6 px-4 md:grid-cols-[420px_1fr] md:px-6"
            : "mt-6 grid grid-cols-1 gap-6 px-4 md:px-6"
        }
      >
        <div className="flex flex-col gap-6 md:col-start-2 md:row-start-1">
          <StatusBlock member={member} hours={weekdayHours} specialHours={specialHoursDays} tonightEvent={tonightEvent} />
          <DiscountBlock member={member} />
          <CategoryChips categories={categories} />
        </div>

        {hasCarousel && (
          <div className="md:col-start-1 md:row-start-1 md:row-span-4">
            <MediaCarousel slides={carouselSlides} memberName={member.business_name} theme={member.theme} />
          </div>
        )}

        <div className="flex flex-col gap-6 md:col-start-2 md:row-start-2">
          <ScheduleChips hours={weekdayHours} memberType={member.member_type} />
          <EventsModule events={events} memberType={member.member_type} />
        </div>

        <div className="md:col-start-2 md:row-start-3">
          <LinkPills links={links} />
        </div>

        <div className="md:col-start-2 md:row-start-4">
          <ContactBlock member={member} />
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
