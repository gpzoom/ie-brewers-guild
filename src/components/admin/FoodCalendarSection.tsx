import { useRouter } from "@tanstack/react-router";
import { CalendarConnectionPanel } from "@/components/admin/CalendarConnectionPanel";
import { KitchenSwitch } from "@/components/admin/KitchenSwitch";
import { FoodCalendarModule } from "@/components/profile/FoodCalendarModule";
import { HelpVideoButton } from "@/components/admin/HelpVideoButton";
import { HELP_VIDEOS } from "@/data/help-videos";
import type { FoodCalendarData } from "@/lib/portal/section-data.server";
import { GuestStopRows, useGuestStops } from "@/components/admin/GuestStopsBox";
import { toGuestSlot } from "@/lib/events/guest-stops";

/**
 * A producer's food calendar (docs/member-profiles.md, "Events" > "Food
 * calendar"; artboard M2): its own connection box (own link, own tag), and
 * once connected, the next seven days exactly as "Food for the next week" shows
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
  const router = useRouter();
  // Guild food vendors' stops here (Guild Mobile members at taprooms): in
  // the preview when shown, and listed under it with Hide/Show.
  const guestStops = useGuestStops(memberId);
  const foodStops = (guestStops.stops ?? []).filter((stop) => stop.food);
  const guestSlots = foodStops.filter((stop) => stop.status === "shown").map(toGuestSlot);
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
          Show what there is to eat at your taproom over the next 7 days: visiting food trucks
          and pop-ups, and your own kitchen's specials. Tag each one{" "}
          <strong className="font-semibold text-ink">#food</strong> on your events calendar.
          Changes show on your page right away.
        </p>
        {canEdit && (
          <div className="pt-2">
            <KitchenSwitch
              memberId={memberId}
              initialHasKitchen={food.hasKitchen}
              onChanged={() => router.invalidate()}
            />
          </div>
        )}
        {/* The food calendar builds on the events one (owner, 2026-09-30). */}
        <div className="flex flex-col gap-1 pt-1">
          <p className="text-[13px] text-ink-muted">
            If your Events calendar isn't set up yet, watch this video first:
          </p>
          <HelpVideoButton
            video={HELP_VIDEOS.googleEventsCalendar}
            label="Watch how to connect a Google Calendar for EVENTS"
          />
        </div>
      </div>
      <CalendarConnectionPanel
        memberId={memberId}
        initialConnection={food.connection}
        canEdit={canEdit}
        purpose="food"
      />
      {(food.connection || food.hasKitchen || guestSlots.length > 0) && (
        <div className="rounded-[14px] border border-canvas-border bg-canvas px-4 py-4 md:px-5">
          <FoodCalendarModule
            label="Next 7 days on your profile"
            slots={food.slots}
            now={new Date()}
            timezone={memberTimezone}
            hours={food.hours}
            specialHours={food.specialHours}
            hasKitchen={food.hasKitchen}
            guestSlots={guestSlots}
          />
        </div>
      )}
      {foodStops.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold text-ink">Guild food vendors at your taproom</h2>
          <p className="text-pretty text-[13px] text-ink-muted">
            From their own schedules. Hide any you don&rsquo;t want on your page.
          </p>
          {guestStops.error && (
            <p role="alert" className="text-[13px] text-[#B42318]">
              {guestStops.error}
            </p>
          )}
          <GuestStopRows stops={foodStops} timezone={memberTimezone} onSetStatus={guestStops.setStatus} />
        </div>
      )}
    </div>
  );
}
