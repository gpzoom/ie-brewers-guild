import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  getPublishGateData,
  publishMemberProfile,
  unpublishMemberProfile,
  type PublishGateData,
} from "@/lib/hours/publish-gate.server";
import {
  canSubmitPublish,
  computeHoursConfirmationBadge,
  formatWeekdayHours,
  isEveryAppearanceInThePast,
} from "@/lib/hours/publish-gate";
import type { MemberStatus } from "@/lib/supabase/types";
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

type FreshState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: PublishGateData };

/**
 * Producer/Allied variant: shows hours read-only, gates on a confirmation
 * checkbox. Mobile variant: no weekly hours exist at all, so the gate
 * instead warns if every listed appearance is already in the past (spec,
 * "Hours and the publish gate", last paragraph).
 *
 * `initial` is the admin layout loader's snapshot. It is only trusted for
 * the always-visible controls (status, slug, stale-hours badge) -- and even
 * those resync whenever the loader re-runs (router.invalidate() after a
 * publish/unpublish). The dialog body never renders from it: the hours
 * editor saves straight to the database without re-running that loader,
 * so on every open the dialog re-reads getPublishGateData and only lets
 * the member confirm once that fresh read has landed.
 *
 * The Preview / View profile link lives in AdminShell's top bar instead
 * (it's stateless, so unlike this component it can render wherever each
 * breakpoint's design puts it); it follows the loader's status, which
 * router.invalidate() refreshes right after a publish/unpublish here.
 */
export function PublishGateDialog({
  memberId,
  initial,
}: {
  memberId: string;
  initial: PublishGateData;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [fresh, setFresh] = useState<FreshState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Optimistic status after a publish/unpublish, shown until the loader
  // re-runs and hands down the same value as `initial.status` -- at which
  // point the override is dropped and the loader is the source of truth
  // again (so a later change elsewhere is never masked by a stale copy).
  const [statusOverride, setStatusOverride] = useState<MemberStatus | null>(null);
  const [lastInitialStatus, setLastInitialStatus] = useState(initial.status);
  if (lastInitialStatus !== initial.status) {
    setLastInitialStatus(initial.status);
    setStatusOverride(null);
  }
  const currentStatus = statusOverride ?? initial.status;

  // Guards against an older, slower fetch overwriting a newer one (e.g.
  // the dialog closed and reopened quickly, or a retry).
  const requestIdRef = useRef(0);

  async function loadFresh() {
    const requestId = ++requestIdRef.current;
    setFresh({ kind: "loading" });
    try {
      const data = await getPublishGateData({ data: { memberId } });
      if (requestId === requestIdRef.current) setFresh({ kind: "ready", data });
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setFresh({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't load your latest hours.",
        });
      }
    }
  }

  useEffect(() => {
    if (open) {
      void loadFresh();
    } else {
      // Invalidate any in-flight request and reset for the next open.
      requestIdRef.current++;
      setFresh({ kind: "loading" });
      setConfirmed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch on open only
  }, [open, memberId]);

  const badge = computeHoursConfirmationBadge(initial.hoursConfirmedAt);
  const freshData = fresh.kind === "ready" ? fresh.data : null;
  const isMobile = (freshData?.memberType ?? initial.memberType) === "mobile";
  const allPast = freshData
    ? isMobile && isEveryAppearanceInThePast(freshData.appearanceStartTimes)
    : false;
  const canPublish = canSubmitPublish({ freshDataLoaded: freshData !== null, isMobile, confirmed });

  async function onPublish() {
    setError(null);
    setSubmitting(true);
    try {
      await publishMemberProfile({ data: { memberId } });
      setStatusOverride("published");
      setOpen(false);
      void router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onUnpublish() {
    setError(null);
    setSubmitting(true);
    try {
      await unpublishMemberProfile({ data: { memberId } });
      setStatusOverride("draft");
      void router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // Everything outside the dialog sits in AdminShell's single responsive
  // container: the light bottom bar on a phone (artboard AdminPhone), the
  // near-black top bar at md and up (artboard AdminBasics) -- hence the
  // paired phone / md: colours on each control below.
  if (currentStatus === "published") {
    return (
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        {badge.kind === "stale" && (
          <p role="alert" className="text-xs text-ink-muted md:max-w-[16rem] md:text-warn">
            Hours confirmed {badge.daysAgo} days ago — worth a check.
          </p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={onUnpublish}
          className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-[10px] border border-canvas-border bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-50 md:h-10 md:w-auto md:rounded-[9px] md:border-border-dark md:bg-transparent md:text-[13px] md:text-canvas md:hover:bg-white/10"
        >
          Move back to draft
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger md:text-xs md:text-[oklch(0.75_0.14_27)]">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <p className="text-[11px] text-ink-muted md:hidden">
        Changes save as you type. Publishing needs one more step.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex h-[50px] w-full shrink-0 items-center justify-center rounded-[11px] bg-brand px-[18px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright md:h-10 md:w-auto md:rounded-[9px] md:text-[13px]"
          >
            Publish changes
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isMobile ? "Review your appearances" : "Review your hours"}</DialogTitle>
          </DialogHeader>

          {fresh.kind === "loading" && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading your latest {isMobile ? "appearances" : "hours"}…
            </p>
          )}

          {fresh.kind === "error" && (
            <div role="alert" className="space-y-2 text-sm text-danger">
              <p>
                Couldn't load your latest {isMobile ? "appearances" : "hours"}: {fresh.message}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => void loadFresh()}
              >
                Try again
              </Button>
            </div>
          )}

          {freshData &&
            (isMobile ? (
              allPast ? (
                <p
                  role="alert"
                  className="text-sm text-[color-mix(in_oklch,var(--warn),black_45%)]"
                >
                  Every listed appearance is in the past — visitors won't see anything upcoming. You
                  can still publish, but consider adding a date first.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You have at least one upcoming appearance listed.
                </p>
              )
            ) : (
              <ul className="space-y-1 text-sm">
                {WEEKDAYS.map((label, weekday) => (
                  <li key={weekday} className="flex justify-between border-b border-border py-1">
                    <span>{label}</span>
                    <span>{formatWeekdayHours(freshData.hours, weekday)}</span>
                  </li>
                ))}
                {freshData.specialHours.length > 0 && (
                  <li className="pt-2 text-xs text-muted-foreground">
                    {freshData.specialHours.length} holiday/one-off change(s) on file.
                  </li>
                )}
              </ul>
            ))}

          {!isMobile && (
            <label className="mt-4 flex min-h-11 items-start gap-2">
              <Checkbox
                checked={confirmed}
                disabled={!freshData}
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
              disabled={!canPublish || submitting}
              className="h-11 w-full"
              onClick={onPublish}
            >
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
