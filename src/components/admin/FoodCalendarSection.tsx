import { useRouter } from "@tanstack/react-router";
import { CalendarConnectionPanel } from "@/components/admin/CalendarConnectionPanel";
import { FoodCalendarModule } from "@/components/profile/FoodCalendarModule";
import type { FoodCalendarData } from "@/lib/portal/section-data.server";

/**
 * A producer's food calendar on their Events screens (docs/member-profiles.md,
 * "Events" > "Food calendar"; artboard M): its own connection box (own link,
 * own tag), and once connected, the next seven days exactly as "Food this
 * week" shows them on the profile. Refresh now reloads the preview.
 */
export function FoodCalendarSection({
  memberId,
  food,
  memberTimezone,
  canEdit,
}: {
  memberId: string;
  food: FoodCalendarData;
  memberTimezone: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[21px] font-bold leading-tight text-ink">Food trucks</h2>
        <p className="text-pretty text-[13px] text-ink-muted">
          Show which food trucks and pop-ups are at your taproom over the next 7 days, from a
          calendar of their own.
        </p>
      </div>
      <CalendarConnectionPanel
        memberId={memberId}
        initialConnection={food.connection}
        canEdit={canEdit}
        purpose="food"
        onRefreshed={() => void router.invalidate()}
      />
      {food.connection && (
        <div className="rounded-[14px] border border-canvas-border bg-canvas px-4 py-4 md:px-5">
          <FoodCalendarModule
            label="Next 7 days on your profile"
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
