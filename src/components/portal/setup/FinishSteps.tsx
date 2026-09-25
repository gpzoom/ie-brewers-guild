import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { MemberDraftBundle, DraftStatus } from "@/lib/drafts/drafts.server";
import { getDraftStatus, publishDraft } from "@/lib/drafts/drafts.server";
import type { PublishGateData } from "@/lib/hours/publish-gate.server";
import type { MemberPreviewData } from "@/lib/members/member-profile.server";
import type { PortalSetupShell } from "@/lib/portal/portal-setup.server";
import { publishNeedsHoursCheck } from "@/lib/drafts/sections";
import { isEveryAppearanceInThePast } from "@/lib/hours/publish-gate";
import { sectionCompleteness } from "@/lib/portal/section-completeness";
import { Checkbox } from "@/components/ui/checkbox";
import { PublishHoursTable } from "@/components/admin/PublishGateDialog";
import { useDraftStatus } from "@/components/admin/DraftStatusContext";
import { MemberProfileTemplate } from "@/components/profile/MemberProfileTemplate";
import { StatusBand, bandButtonClass } from "@/components/shell/AppChrome";
import {
  WizardInfoBox,
  WizardStep,
  wizardSecondaryButtonClass,
} from "@/components/portal/setup/WizardStep";
import { useWizardNavigation } from "@/components/portal/setup/useWizardNavigation";
import { cn } from "@/lib/utils";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Review: every step for this type, done or empty, each empty one with
 * "Do it now". Worked out by sectionCompleteness (src/lib/portal/section-
 * completeness.ts) from the draft plus the live events facts -- the same
 * function phase 5's "Finish your profile" card uses.
 */
export function ReviewStep({
  shell,
  draft,
  eventCount,
  hasCalendarConnection,
}: {
  shell: PortalSetupShell;
  draft: MemberDraftBundle;
  eventCount: number;
  hasCalendarConnection: boolean;
}) {
  const { goTo } = useWizardNavigation();
  const [opening, setOpening] = useState<string | null>(null);
  const checklist = sectionCompleteness(draft.data, {
    memberType: shell.memberType,
    typeConfirmed: shell.typeConfirmed,
    eventCount,
    hasCalendarConnection,
  });
  const emptyCount = checklist.filter((item) => !item.done).length;

  return (
    <WizardStep
      step="review"
      title="Review"
      lede={
        emptyCount === 0
          ? "Everything's filled in. Take a look at your page before it goes live."
          : `${emptyCount} ${emptyCount === 1 ? "step is" : "steps are"} still empty. Do ${emptyCount === 1 ? "it" : "them"} now, or preview your page and finish later from your portal.`
      }
      continueLabel="Preview your page"
    >
      <ul className="flex flex-col overflow-hidden rounded-[12px] border border-canvas-border bg-white">
        {checklist.map((item) => (
          <li
            key={item.step}
            className="flex min-h-14 items-center justify-between gap-3 border-b border-canvas-2 px-[14px] py-2 last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  item.done ? "bg-ink text-canvas" : "border border-dashed border-ink-subtle",
                )}
              >
                {item.done && <CheckIcon />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] font-medium text-ink">{item.label}</span>
                <span className="text-[12px] text-ink-muted">{item.done ? "Done" : "Empty"}</span>
              </span>
            </span>
            {!item.done && item.step !== "type" && item.step !== "basics" && (
              <button
                type="button"
                disabled={opening !== null}
                onClick={() => {
                  setOpening(item.step);
                  void goTo(item.step).finally(() => setOpening(null));
                }}
                className="inline-flex min-h-11 shrink-0 items-center rounded-[9px] px-3 text-[14px] font-medium text-brand hover:bg-canvas-2 hover:text-brand-hover disabled:opacity-60"
              >
                {opening === item.step ? "Opening…" : "Do it now"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </WizardStep>
  );
}

/**
 * Preview: the draft through the real profile template (the same data and
 * rendering as /admin/preview), behind a "Preview · not live yet" band
 * with Keep editing (back to Review) and Publish (the publish check).
 */
export function PreviewStep({ data }: { data: MemberPreviewData }) {
  return (
    <>
      <StatusBand
        message={
          <>
            Preview · not live yet.{" "}
            <span className="font-normal">This is your page with everything you've set up.</span>
          </>
        }
        actions={
          <>
            <Link to="/portal/setup/$step" params={{ step: "review" }} className={bandButtonClass}>
              Keep editing
            </Link>
            <Link
              to="/portal/setup/$step"
              params={{ step: "publish" }}
              className={cn(bandButtonClass, "bg-white text-brand hover:bg-white/90")}
            >
              Publish
            </Link>
          </>
        }
      />
      <div className="pt-4 md:pt-6">
        <MemberProfileTemplate data={data.profile} search={{}} mediaMode="preview" />
      </div>
    </>
  );
}

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

/**
 * The publish check as a page (the same rules and server calls as
 * PublishGateDialog): a never-published member publishes every section
 * (plan Decision 10, owner or full editor only) and always gets the hours
 * read-back with the "correct as of today" tick -- or, for a mobile
 * member, the warning when every listed date is in the past. On success:
 * "You're live".
 */
export function PublishStep({
  shell,
  gate,
  draftStatus,
}: {
  shell: PortalSetupShell;
  gate: PublishGateData;
  draftStatus: DraftStatus;
}) {
  const navigate = useNavigate();
  const draft = useDraftStatus();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPublished = gate.status === "published";
  const isMobile = gate.memberType === "mobile";
  const sections = draftStatus.publishSections;
  const needsHoursCheck = publishNeedsHoursCheck(sections);
  const allPast = isMobile && isEveryAppearanceInThePast(gate.appearanceStartTimes);
  const confirmedOn = formatConfirmedOn(gate.hoursConfirmedAt);
  const upToDate = isPublished && sections.length === 0;
  const blocked = !draftStatus.canPublish && !upToDate;
  const needsTick = needsHoursCheck && !isMobile;
  const publishLabel = isPublished ? "Publish changes" : "Publish";

  async function onPublish() {
    if (upToDate) {
      await navigate({ to: "/portal/setup/$step", params: { step: "live" } });
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Re-read what's unpublished right now, as the dialog does, so the
      // sections sent are the draft's current ones.
      const latest = await getDraftStatus({ data: { memberId: shell.memberId } });
      draft?.setStatus(latest);
      if (latest.publishSections.length > 0) {
        await publishDraft({
          data: {
            memberId: shell.memberId,
            sections: latest.publishSections,
            // Exactly as PublishGateDialog: the hours check (and so the
            // confirmation) applies only when basics is going live. Mobile
            // members have no weekly hours to tick; their check still
            // stamps the confirmation date. Without the check: false.
            confirmHours: publishNeedsHoursCheck(latest.publishSections)
              ? isMobile
                ? true
                : confirmed
              : false,
          },
        });
      }
      await navigate({ to: "/portal/setup/$step", params: { step: "live" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed — try again.");
      setSubmitting(false);
    }
  }

  let lede: string;
  if (upToDate) lede = "Your page is live and there's nothing new to publish.";
  else if (blocked)
    lede =
      "Your profile can't be published from here right now. If you think it should be, get in touch with the Guild.";
  else if (!needsHoursCheck)
    lede = "Ready when you are: publishing puts your changes on your live page.";
  else if (isMobile)
    lede = "Visitors look for where to find you next — make sure your upcoming dates are listed.";
  else
    lede = `Wrong hours are the fastest way to lose a visitor. ${
      confirmedOn
        ? `You last confirmed your hours on ${confirmedOn}.`
        : "You haven't confirmed your hours yet."
    }`;

  return (
    <WizardStep
      step="publish"
      title={upToDate ? "You're up to date" : "One last check"}
      lede={lede}
      backTo="preview"
      onContinue={onPublish}
      continueLabel={submitting ? "Publishing…" : upToDate ? "See your live page" : publishLabel}
      continueDisabled={blocked || submitting || (needsTick && !confirmed && !upToDate)}
      hideContinue={blocked}
      error={error}
    >
      {!upToDate && !blocked && needsHoursCheck && isMobile && (
        <p
          role={allPast ? "alert" : undefined}
          className={cn(
            "rounded-[12px] border border-canvas-border bg-white px-4 py-3 text-[13px] leading-[1.5]",
            allPast ? "text-[color-mix(in_oklch,var(--warn),black_45%)]" : "text-ink-muted",
          )}
        >
          {allPast
            ? "Every listed date is in the past — visitors won't see anything upcoming. You can still publish, but consider adding a date first."
            : "You have at least one upcoming date listed."}
        </p>
      )}

      {!upToDate && !blocked && needsTick && (
        <>
          <PublishHoursTable
            hours={gate.hours}
            specialHours={gate.specialHours}
            editLink={
              <Link
                to="/portal/setup/$step"
                params={{ step: "hours" }}
                className="inline-flex min-h-11 items-center px-2 text-[12px] font-medium text-brand hover:text-brand-hover"
              >
                Edit hours
              </Link>
            }
          />
          <label className="flex cursor-pointer items-start gap-[13px] rounded-[12px] border-2 border-brand bg-[#FCF3EA] px-[18px] py-4">
            <Checkbox
              checked={confirmed}
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
          {!confirmed && <p className="text-[12px] text-ink-subtle">Check the box to publish.</p>}
        </>
      )}

      {!upToDate && !blocked && !isPublished && (
        <WizardInfoBox>
          Publishing puts your profile on the Guild's member directory. You can keep editing
          afterward — changes go live when you publish them.
        </WizardInfoBox>
      )}
    </WizardStep>
  );
}

/** "You're live": the page link, Copy link, Share, then on to the portal. */
export function LiveStep({ shell }: { shell: PortalSetupShell }) {
  const navigate = useNavigate();
  const isLive = shell.status === "published";
  const path = `/members/${shell.slug}`;
  // The origin is only known in the browser (staging and production differ).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${path}`;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  /** The phone's share sheet where there is one; otherwise it copies the link. */
  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shell.memberName, url });
        return;
      } catch (err) {
        // The member closed the share sheet: nothing to do.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copy();
  }

  if (!isLive) {
    return (
      <WizardStep
        step="live"
        title="Not live yet"
        lede="Your profile hasn't been published. Run the last check to put it live."
        backTo="review"
        continueLabel="Go to the last check"
        onContinue={() => navigate({ to: "/portal/setup/$step", params: { step: "publish" } })}
      />
    );
  }

  return (
    <WizardStep
      step="live"
      title="You're live"
      lede="Your profile is on the Guild's member directory. Share it anywhere you'd send people."
      backTo={null}
      continueLabel="Go to your portal"
      onContinue={() => navigate({ to: "/portal" })}
    >
      <div className="flex flex-col gap-3 rounded-[12px] border border-canvas-border bg-white px-[14px] py-3">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
          Your page
        </span>
        <a
          href={path}
          target="_blank"
          rel="noopener"
          className="break-all text-[15px] font-medium text-brand underline underline-offset-2 hover:text-brand-hover"
        >
          {origin ? url : path}
        </a>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => void copy()} className={wizardSecondaryButtonClass}>
            {copyState === "copied" ? "Copied" : "Copy link"}
          </button>
          <button type="button" onClick={() => void share()} className={wizardSecondaryButtonClass}>
            Share
          </button>
        </div>
        <span aria-live="polite" className="text-[12px] text-ink-muted">
          {copyState === "copied"
            ? "Link copied."
            : copyState === "failed"
              ? "Couldn't copy — select the link above and copy it."
              : ""}
        </span>
      </div>
    </WizardStep>
  );
}
