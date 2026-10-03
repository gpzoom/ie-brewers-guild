import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { getPublishGateData, type PublishGateData } from "@/lib/hours/publish-gate.server";
import {
  discardDraft,
  getDraftStatus,
  publishDraft,
  unpublishMember,
  type DraftStatus,
} from "@/lib/drafts/drafts.server";
import { draftSaveQueue } from "@/lib/drafts/save-queue";
import {
  publishNeedsHoursCheck,
  type DraftHours,
  type DraftSpecialHours,
} from "@/lib/drafts/sections";
import {
  canSubmitPublish,
  computeHoursConfirmationBadge,
  formatWeekdayHours,
  isEveryAppearanceInThePast,
} from "@/lib/hours/publish-gate";
import { Checkbox } from "@/components/ui/checkbox";
import { saveNoteText } from "@/components/admin/SaveNote";
import { useDraftStatus, usePendingDraftSaves } from "@/components/admin/DraftStatusContext";
import { useMemberEditing } from "@/components/admin/MemberEditingContext";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

// Controls sit in AdminShell's single responsive container: the light
// bottom bar on a phone (artboard AdminPhone), the near-black top bar at md
// and up (artboard AdminBasics) -- hence the paired phone / md: colors.
const primaryClass =
  "inline-flex h-[50px] w-full min-w-0 flex-1 items-center justify-center rounded-[11px] bg-brand px-[18px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright disabled:cursor-not-allowed disabled:bg-[#DED7CB] disabled:text-[#8C8275] md:h-10 md:w-auto md:flex-none md:rounded-[9px] md:text-[13px] md:disabled:bg-white/10 md:disabled:text-text-muted";
const secondaryClass =
  "inline-flex h-[50px] w-full min-w-0 flex-1 items-center justify-center rounded-[11px] border border-canvas-border bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-50 md:h-10 md:w-auto md:flex-none md:rounded-[9px] md:border-border-dark md:bg-transparent md:text-[13px] md:text-canvas md:hover:bg-white/10";
const quietClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center px-2 text-[13px] font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50 md:min-h-10 md:text-[12px] md:text-text-muted md:hover:text-canvas";
const dialogButtonClass =
  "inline-flex h-[46px] items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * The publish check's read-only "What visitors will see" week (artboard
 * AdminPublish), shared by this dialog and the setup wizard's publish step.
 */
export function PublishHoursTable({
  hours,
  specialHours,
  editLink,
}: {
  hours: DraftHours[];
  specialHours: DraftSpecialHours[];
  /** The "Edit hours" link in the table's header, if any. */
  editLink?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-canvas-border bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-canvas-2 bg-[#FCFAF6] py-1 pl-4 pr-2">
        <h3 className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
          What visitors will see
        </h3>
        {editLink}
      </div>
      <ul className="py-0.5">
        {WEEK_ORDER.map((weekday) => {
          const value = formatWeekdayHours(hours, weekday);
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
      {specialHours.length > 0 && (
        <p className="border-t border-canvas-2 px-4 py-2.5 text-[12px] text-ink-muted">
          {specialHours.length} holiday/one-off change(s) on file.
        </p>
      )}
    </div>
  );
}

/**
 * The top bar's publish controls (plan phase 2, "Top bar"): the
 * "Unpublished changes" label (plus the owner's "Photo changes from
 * [email] waiting to publish"), Discard changes, Publish changes, and Move
 * back to draft. Rendered exactly once by AdminShell -- see its doc comment.
 *
 * Publishing copies the viewer's publishable dirty sections live in one
 * transaction (publishDraft -> publish_member_draft); a never-published
 * member publishes every section (plan Decision 10). The publish check --
 * hours read-back and the "correct as of today" tick, or for a mobile
 * member the past-appearances warning -- runs only when `basics` is among
 * the sections going live, and reads the hours from the DRAFT, since those
 * are the hours about to go live. The dialog re-reads them every time it
 * opens and only lets the member confirm once that fresh read has landed.
 */
export function PublishGateDialog({
  memberId,
  initial,
}: {
  memberId: string;
  initial: PublishGateData;
}) {
  const router = useRouter();
  const draft = useDraftStatus();
  const hoursLink = useMemberEditing()?.paths.hours ?? null;
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [fresh, setFresh] = useState<FreshState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [settling, setSettling] = useState(false);
  const pendingSaves = usePendingDraftSaves(memberId);

  // Guards against an older, slower fetch overwriting a newer one.
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
      requestIdRef.current++;
      setFresh({ kind: "loading" });
      setConfirmed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch on open only
  }, [open, memberId]);

  if (!draft) return null;
  const { status } = draft;
  const isPublished = status.status === "published";
  // Saves still queued/running: the buttons say "Saving…". They stay
  // clickable on purpose -- clicking Publish right after typing blurs the
  // field on mousedown, which queues its save; disabling at that instant
  // would swallow the click. The handlers wait for the saves instead
  // (settleSaves), and are disabled while they do.
  const saving = pendingSaves > 0 || settling;
  const busy = submitting || settling;

  const badge = computeHoursConfirmationBadge(initial.hoursConfirmedAt);
  const freshData = fresh.kind === "ready" ? fresh.data : null;
  const isMobile = (freshData?.memberType ?? initial.memberType) === "mobile";
  const allPast = freshData
    ? isMobile && isEveryAppearanceInThePast(freshData.appearanceStartTimes)
    : false;
  const canConfirm = canSubmitPublish({ freshDataLoaded: freshData !== null, isMobile, confirmed });
  const confirmedOn = formatConfirmedOn(freshData?.hoursConfirmedAt ?? initial.hoursConfirmedAt);
  const showTickHint = !isMobile && freshData !== null && !confirmed;

  const publishLabel =
    status.role === "media_events" ? "Publish photos" : isPublished ? "Publish changes" : "Publish";

  /**
   * Before publishing or discarding, let every edit finish saving: blur the
   * focused field (its onBlur flushes any debounced save straight into the
   * queue), wait until no save for this member is queued or running, then
   * re-read the draft status so the sections sent are the ones the draft
   * actually has now -- not the top bar's possibly-older copy.
   */
  async function settleSaves(): Promise<DraftStatus> {
    setSettling(true);
    try {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      await draftSaveQueue.whenIdle(`${memberId}:`);
      const latest = await getDraftStatus({ data: { memberId } });
      draft?.setStatus(latest);
      return latest;
    } finally {
      setSettling(false);
    }
  }

  async function runPublish(confirmHours: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const latest = await settleSaves();
      if (latest.publishSections.length === 0) {
        setOpen(false);
        return;
      }
      await publishDraft({ data: { memberId, sections: latest.publishSections, confirmHours } });
      setOpen(false);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onPublishClick() {
    setError(null);
    let latest: DraftStatus;
    try {
      latest = await settleSaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check your changes — try again.");
      return;
    }
    if (latest.publishSections.length === 0) return;
    if (publishNeedsHoursCheck(latest.publishSections)) setOpen(true);
    else void runPublish(false);
  }

  async function onDiscard() {
    setError(null);
    setSubmitting(true);
    try {
      const latest = await settleSaves();
      if (latest.discardSections.length > 0) {
        await discardDraft({ data: { memberId, sections: latest.discardSections } });
      }
      setConfirmDiscard(false);
      await router.invalidate();
      // The editors hold their own copies of what they were editing;
      // remount them from the reloaded (discarded) draft.
      draft?.bumpEpoch();
    } catch (err) {
      setConfirmDiscard(false);
      setError(err instanceof Error ? err.message : "Couldn't discard your changes.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onUnpublish() {
    setError(null);
    setSubmitting(true);
    try {
      await unpublishMember({ data: { memberId } });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't move your profile back to draft.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <div className="flex flex-col gap-0.5 md:items-end">
        <p className="text-[11px] text-ink-muted md:hidden">{saveNoteText(isPublished)}</p>
        {status.showUnpublished && (
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink md:text-canvas">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-brand md:bg-brand-bright"
            />
            {status.role === "media_events" ? "Unpublished photo changes" : "Unpublished changes"}
          </p>
        )}
        {status.photoChangesFrom && (
          <p className="max-w-[18rem] truncate text-[11px] text-ink-muted md:text-text-muted">
            Photo changes from {status.photoChangesFrom} waiting to publish
          </p>
        )}
        {isPublished && badge.kind === "stale" && (
          <p role="alert" className="text-xs text-ink-muted md:max-w-[16rem] md:text-warn">
            Hours confirmed {badge.daysAgo} days ago — worth a check.
          </p>
        )}
      </div>

      <div className="flex gap-2 md:items-center md:gap-3">
        {status.showDiscard && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDiscard(true)}
            className={secondaryClass}
          >
            {saving ? "Saving…" : "Discard changes"}
          </button>
        )}
        {(status.canPublish || isPublished) && (
          <button
            type="button"
            disabled={!status.canPublish || busy}
            title={status.canPublish ? undefined : "Nothing new to publish"}
            onClick={() => void onPublishClick()}
            className={primaryClass}
          >
            {saving ? "Saving…" : submitting && !open ? "Publishing…" : publishLabel}
          </button>
        )}
      </div>

      {status.canUnpublish && (
        <button type="button" disabled={busy} onClick={onUnpublish} className={quietClass}>
          Move back to draft
        </button>
      )}

      {error && !open && (
        <p
          role="alert"
          className="text-sm text-danger md:max-w-[18rem] md:text-xs md:text-[oklch(0.75_0.14_27)]"
        >
          {error}
        </p>
      )}

      <AlertDialog
        open={confirmDiscard}
        onOpenChange={(next) => !submitting && setConfirmDiscard(next)}
      >
        <AlertDialogContent className="rounded-[18px] border-0 bg-canvas p-[30px] sm:rounded-[18px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
              Throw away your unpublished changes?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
              Your live page stays as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-[46px] rounded-[9px] border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink hover:bg-canvas-2">
              Keep editing
            </AlertDialogCancel>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDiscard()}
              className="inline-flex h-[46px] items-center justify-center rounded-[9px] bg-danger px-6 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {settling ? "Saving…" : submitting ? "Discarding…" : "Discard changes"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
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
                      You last confirmed your hours on{" "}
                      <strong className="font-semibold text-ink">{confirmedOn}</strong>.
                    </>
                  ) : (
                    "You haven't confirmed your hours yet."
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
              <button type="button" className={dialogButtonClass} onClick={() => void loadFresh()}>
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
              <PublishHoursTable
                hours={freshData.hours}
                specialHours={freshData.specialHours}
                editLink={
                  hoursLink && (
                    <Link
                      to={hoursLink.to}
                      hash={hoursLink.hash}
                      onClick={() => setOpen(false)}
                      className="inline-flex min-h-11 items-center px-2 text-[12px] font-medium text-brand hover:text-brand-hover"
                    >
                      Edit hours
                    </Link>
                  )
                }
              />
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
              <button type="button" className={dialogButtonClass}>
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
                disabled={!canConfirm || busy}
                // Mobile members have no weekly hours to tick; their check is
                // the appearances warning, and publishing still stamps the
                // confirmation date as it always has.
                onClick={() => void runPublish(isMobile ? true : confirmed)}
                className="inline-flex h-[46px] items-center justify-center rounded-[9px] bg-brand px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:bg-[#DED7CB] disabled:text-[#8C8275]"
              >
                {submitting ? "Publishing…" : publishLabel}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
