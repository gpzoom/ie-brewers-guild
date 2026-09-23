import { useState } from "react";
import { publishMemberProfile, unpublishMemberProfile } from "@/lib/hours/publish-gate.server";
import {
  computeHoursConfirmationBadge,
  isEveryAppearanceInThePast,
} from "@/lib/hours/publish-gate";
import type { HoursRow, MemberStatus, MemberType, SpecialHoursRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Producer/Allied variant: shows hours read-only, gates on a confirmation
 * checkbox. Mobile variant: no weekly hours exist at all, so the gate
 * instead warns if every listed appearance is already in the past (spec,
 * "Hours and the publish gate", last paragraph).
 */
export function PublishGateDialog({
  memberId,
  memberType,
  status,
  hoursConfirmedAt,
  hours,
  specialHours,
  appearanceStartTimes,
}: {
  memberId: string;
  memberType: MemberType;
  status: MemberStatus;
  hoursConfirmedAt: string | null;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
  appearanceStartTimes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [error, setError] = useState<string | null>(null);

  const badge = computeHoursConfirmationBadge(hoursConfirmedAt);
  const isMobile = memberType === "mobile";
  const allPast = isMobile && isEveryAppearanceInThePast(appearanceStartTimes);

  async function onPublish() {
    setError(null);
    try {
      await publishMemberProfile({ data: { memberId } });
      setCurrentStatus("published");
      setOpen(false);
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    }
  }

  async function onUnpublish() {
    setError(null);
    try {
      await unpublishMemberProfile({ data: { memberId } });
      setCurrentStatus("draft");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  if (currentStatus === "published") {
    return (
      <div className="flex items-center justify-between gap-3">
        {badge.kind === "stale" && (
          <p role="alert" className="text-sm text-warn">
            Hours confirmed {badge.daysAgo} days ago — worth a check.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-11"
          onClick={onUnpublish}
        >
          Move back to draft
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="h-11 w-full">
          Publish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isMobile ? "Review your appearances" : "Review your hours"}</DialogTitle>
        </DialogHeader>

        {isMobile ? (
          allPast ? (
            <p role="alert" className="text-sm text-warn">
              Every listed appearance is in the past — visitors won't see anything upcoming. You can
              still publish, but consider adding a date first.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              You have at least one upcoming appearance listed.
            </p>
          )
        ) : (
          <ul className="space-y-1 text-sm">
            {WEEKDAYS.map((label, weekday) => {
              const rows = hours.filter((row) => row.weekday === weekday);
              return (
                <li key={weekday} className="flex justify-between border-b border-border py-1">
                  <span>{label}</span>
                  <span>
                    {rows.length === 0
                      ? "Not set"
                      : rows
                          .map((row) =>
                            row.is_closed ? "Closed" : `${row.opens_at}–${row.closes_at}`,
                          )
                          .join(", ")}
                  </span>
                </li>
              );
            })}
            {specialHours.length > 0 && (
              <li className="pt-2 text-xs text-muted-foreground">
                {specialHours.length} holiday/one-off change(s) on file.
              </li>
            )}
          </ul>
        )}

        {!isMobile && (
          <label className="mt-4 flex min-h-11 items-start gap-2">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <span className="text-sm">These hours are correct as of today.</span>
          </label>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            disabled={!isMobile && !confirmed}
            className="h-11 w-full"
            onClick={onPublish}
          >
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
