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
import type { SpecialHoursDay, WeekdayHours } from "@/lib/hours/open-now";
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
 * Mobile-first: this component's own markup is the single column;
 * src/routes/members.$slug.tsx (Task 18) is what adds the desktop split
 * around it, per the spec's stated build order.
 */
export function MemberProfileTemplate({ data, search }: MemberProfileTemplateProps) {
  const { member, hours, specialHours, events, carouselSlides, links, categories, crossLink, headerPrev, headerNext, logoPublicUrl, coverAsset } = data;

  const weekdayHours = toWeekdayHours(hours);
  const specialHoursDays = toSpecialHoursDay(specialHours);

  const now = Date.now();
  const tonightEvent =
    events.find((event) => {
      if (event.overlay_status === "postponed" || event.overlay_status === "canceled") return false;
      const startsAt = new Date(event.overlay_starts_at ?? event.starts_at).getTime();
      return startsAt >= now;
    }) ?? null;

  const coverUrl = coverAsset ? `/api/member-media/${coverAsset.id}` : null;

  return (
    <article className="mx-auto max-w-[1120px]">
      <div className="px-4 pt-4 md:px-6">
        <HeaderNav prev={headerPrev} next={headerNext} search={search} />
      </div>

      <ProfileHero member={member} coverUrl={coverUrl} logoUrl={logoPublicUrl} />

      <div className="mt-6 flex flex-col gap-6 px-4 md:flex-row md:px-6">
        <div className="md:w-[420px] md:shrink-0">
          <MediaCarousel slides={carouselSlides} memberName={member.business_name} theme={member.theme} />
        </div>

        <div className="flex flex-1 flex-col gap-6">
          <StatusBlock member={member} hours={weekdayHours} specialHours={specialHoursDays} tonightEvent={tonightEvent} />

          <DiscountBlock member={member} />
          <CategoryChips categories={categories} />

          <ScheduleChips hours={weekdayHours} memberType={member.member_type} />
          <EventsModule events={events} memberType={member.member_type} />

          <LinkPills links={links} />
          <ContactBlock member={member} />
        </div>
      </div>

      <div className="mt-8 px-4 md:px-6">
        <CrossLinkCard entry={crossLink} memberType={member.member_type} />
      </div>
    </article>
  );
}
