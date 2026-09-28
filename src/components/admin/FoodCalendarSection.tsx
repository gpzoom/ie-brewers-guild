import { CalendarConnectionPanel } from "@/components/admin/CalendarConnectionPanel";
import { FoodCalendarModule } from "@/components/profile/FoodCalendarModule";
import type { FoodCalendarData } from "@/lib/portal/section-data.server";

/**
 * A producer's food calendar (docs/member-profiles.md, "Events" > "Food
 * calendar"; artboard M2): its own connection box (own link, own tag), and
 * once connected, the next seven days exactly as "Food this week" shows
 * them on the profile. Refresh now reloads the preview. `asPage`: it's the
 * whole "Food" page (portal section, /admin/food), with a page
 * heading; otherwise a block inside wizard step 6.
 */
export function FoodCalendarSection({
  memberId,
  food,
  memberTimezone,
  canEdit,
  asPage = false,
}: {
  memberId: string;
  food: FoodCalendarData;
  memberTimezone: string;
  canEdit: boolean;
  asPage?: boolean;
}) {
  const Heading = asPage ? "h1" : "h2";
  return (
    <div className={asPage ? "flex flex-col gap-[26px]" : "flex flex-col gap-3.5"}>
      <div className={asPage ? "flex flex-col gap-1.5" : "flex flex-col gap-1"}>
        <Heading
          className={
            asPage
              ? "font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]"
              : "font-display text-[21px] font-bold leading-tight text-ink"
          }
        >
          Food
        </Heading>
        <p className="text-pretty text-[13px] text-ink-muted">
          Show which food trucks and pop-ups are at your taproom over the next 7 days, from a
          calendar of their own. Changes show on your page right away.
        </p>
      </div>
      <CalendarConnectionPanel
        memberId={memberId}
        initialConnection={food.connection}
        canEdit={canEdit}
        purpose="food"
      />
      {food.connection && (
        <div className="rounded-[14px] border border-canvas-border bg-canvas px-4 py-4 md:px-5">
          <FoodCalendarModule
            label="Next 7 days on your profile"
            // All seven, open: on the profile only today shows until opened.
            collapsible={false}
            slots={food.slots}
            now={new Date()}
            timezone={memberTimezone}
            hours={food.hours}
            specialHours={food.specialHours}
          />
        </div>
      )}
    </div>
  );
}
