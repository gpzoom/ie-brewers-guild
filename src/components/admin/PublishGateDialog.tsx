import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
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
import { Checkbox } from "@/components/ui/checkbox";
import { saveNoteText } from "@/components/admin/SaveNote";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** The table reads Monday first, as in artboard AdminPublish (indexes are 0 = Sunday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "June 14, 2026" in the Guild's own time zone, or null when never confirmed. */
function formatConfirmedOn(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

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
  const confirmedOn = formatConfirmedOn(freshData?.hoursConfirmedAt ?? initial.hoursConfirmedAt);
  const showTickHint = !isMobile && freshData !== null && !confirmed;

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
  // paired phone / md: colors on each control below.
  if (currentStatus === "published") {
    return (
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <p className="text-[11px] text-ink-muted md:hidden">{saveNoteText(true)}</p>
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
      <p className="text-[11px] text-ink-muted md:hidden">{saveNoteText(false)}</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex h-[50px] w-full shrink-0 items-center justify-center rounded-[11px] bg-brand px-[18px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright md:h-10 md:w-auto md:rounded-[9px] md:text-[13px]"
          >
            Publish
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[600px] gap-[22px] overflow-y-auto rounded-[18px] border-0 bg-canvas p-6 text-ink sm:rounded-[18px] sm:p-[30px]">
          <DialogHeader className="gap-2 space-y-0 pr-6 text-left">
            <DialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
              One last check
            </DialogTitle>
            <DialogDescription className="text-[14px] leading-[1.5] text-ink-muted [text-wrap:pretty]">
              {isMobile ? (
                "Visitors look for where to find you next — make sure your upcoming appearances are listed."
              ) : (
                <>
                  Wrong hours are the fastest way to lose a visitor.{" "}
                  {confirmedOn ? (
                    <>
                      You last confirmed these on{" "}
                      <strong className="font-semibold text-ink">{confirmedOn}</strong>.
                    </>
                  ) : (
                    "You haven't confirmed these yet."
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {fresh.kind === "loading" && (
            <p role="status" className="text-[13px] text-ink-muted">
              Loading your latest {isMobile ? "appearances" : "hours"}…
            </p>
          )}

          {fresh.kind === "error" && (
            <div role="alert" className="flex flex-col items-start gap-2 text-[13px] text-danger">
              <p>
                Couldn't load your latest {isMobile ? "appearances" : "hours"}: {fresh.message}
              </p>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-[9px] border border-[#D3CBBD] bg-transparent px-4 text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                onClick={() => void loadFresh()}
              >
                Try again
              </button>
            </div>
          )}

          {freshData &&
            (isMobile ? (
              allPast ? (
                <p
                  role="alert"
                  className="rounded-[12px] border border-canvas-border bg-white px-4 py-3 text-[13px] leading-[1.5] text-[color-mix(in_oklch,var(--warn),black_45%)]"
                >
                  Every listed appearance is in the past — visitors won't see anything upcoming. You
                  can still publish, but consider adding a date first.
                </p>
              ) : (
                <p className="rounded-[12px] border border-canvas-border bg-white px-4 py-3 text-[13px] text-ink-muted">
                  You have at least one upcoming appearance listed.
                </p>
              )
            ) : (
              <div className="overflow-hidden rounded-[12px] border border-canvas-border bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-canvas-2 bg-[#FCFAF6] py-1 pl-4 pr-2">
                  <h3 className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
                    What visitors will see
                  </h3>
                  <Link
                    to="/admin/basics"
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center px-2 text-[12px] font-medium text-brand hover:text-brand-hover"
                  >
                    Edit hours
                  </Link>
                </div>
                <ul className="py-0.5">
                  {WEEK_ORDER.map((weekday) => {
                    const value = formatWeekdayHours(freshData.hours, weekday);
                    const muted = value === "Closed" || value === "Not set";
                    return (
                      <li
                        key={weekday}
                        className="flex justify-between gap-4 px-4 py-[9px] text-[13px] last:pb-[11px]"
                      >
                        <span className="text-ink">{WEEKDAYS[weekday]}</span>
                        <span className={`text-right ${muted ? "text-ink-subtle" : "text-[#3A332C]"}`}>
                          {value}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {freshData.specialHours.length > 0 && (
                  <p className="border-t border-canvas-2 px-4 py-2.5 text-[12px] text-ink-muted">
                    {freshData.specialHours.length} holiday/one-off change(s) on file.
                  </p>
                )}
              </div>
            ))}

          {!isMobile && (
            <label
              className={`flex cursor-pointer items-start gap-[13px] rounded-[12px] border-2 border-brand bg-[#FCF3EA] px-[18px] py-4 ${
                freshData ? "" : "cursor-not-allowed opacity-60"
              }`}
            >
              <Checkbox
                checked={confirmed}
                disabled={!freshData}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                className="mt-px h-[19px] w-[19px] rounded-[4px] border-2 border-brand bg-white data-[state=checked]:bg-brand data-[state=checked]:text-white"
              />
              <span className="flex flex-col gap-1">
                <span className="text-[14px] font-semibold text-ink">
                  These hours are correct as of today.
                </span>
                <span className="text-[12px] leading-[1.5] text-ink-muted">
                  We'll stamp your page with today's date and stop nudging you for ninety days.
                </span>
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <DialogClose asChild>
              <button
                type="button"
                className="inline-flex h-[46px] items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Back to editing
              </button>
            </DialogClose>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3.5">
              {showTickHint && (
                <p className="text-center text-[12px] text-ink-subtle sm:text-left">
                  Check the box to continue
                </p>
              )}
              <button
                type="button"
                disabled={!canPublish || submitting}
                onClick={onPublish}
                className="inline-flex h-[46px] items-center justify-center rounded-[9px] bg-brand px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:bg-[#DED7CB] disabled:text-[#8C8275]"
              >
                {submitting ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
