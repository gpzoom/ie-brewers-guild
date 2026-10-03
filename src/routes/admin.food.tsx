import { createFileRoute } from "@tanstack/react-router";
import { getFoodCalendar } from "@/lib/events/food-calendar.server";
import { getMemberBasics } from "@/lib/members/member-basics.server";
import { FoodCalendarSection } from "@/components/admin/FoodCalendarSection";
import { SameMemberGuard } from "@/components/admin/SameMemberGuard";

/**
 * Food (producers only; docs/member-profiles.md, "Events" > "Food
 * calendar"): the food truck calendar and its 7-day preview, the same block
 * as the portal's Food section. Not drafted -- like events, the
 * calendar goes live on its own.
 */
export const Route = createFileRoute("/admin/food")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: async ({ context }) => {
    const [member, food] = await Promise.all([
      getMemberBasics({ data: { memberId: context.memberId } }),
      getFoodCalendar({ data: { memberId: context.memberId } }),
    ]);
    return { dataMemberId: member.id, memberTimezone: member.timezone, food };
  },
  component: FoodRoute,
});

function FoodRoute() {
  const { dataMemberId, memberTimezone, food } = Route.useLoaderData();
  const { memberId } = Route.useRouteContext();
  return (
    <SameMemberGuard memberId={memberId} dataMemberId={dataMemberId}>
      {food ? (
        <FoodCalendarSection
          memberId={memberId}
          food={food}
          memberTimezone={memberTimezone}
          canEdit
          asPage
        />
      ) : (
        <p className="text-[13px] text-ink-muted">The food calendar is only for Producers.</p>
      )}
    </SameMemberGuard>
  );
}
