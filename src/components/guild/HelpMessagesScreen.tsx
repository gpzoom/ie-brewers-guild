import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { setHelpMessageStatus, type HelpMessagesPage } from "@/lib/guild/help-messages.server";
import type { HelpMessageShow, HelpMessageView } from "@/lib/guild/help-messages";
import { cn } from "@/lib/utils";

const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60";
const darkButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas transition-colors hover:bg-ink/85 disabled:opacity-60";

const TABS: Array<{ value: HelpMessageShow; label: string }> = [
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function replyHref(message: HelpMessageView): string {
  const kind = message.kind === "bug" ? "Bug report" : "Feature request";
  const subject = `Re: ${kind}${message.memberName ? `: ${message.memberName}` : ""}`;
  return `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(subject)}`;
}

/**
 * The super admin's Help messages (docs/member-profiles.md, "Help button";
 * artboard Y): what people sent with the Help button, newest first, as
 * Waiting / Done / All. Mark as done (or back to waiting) updates the
 * top bar's bell through router.invalidate(). Times are the Guild's (Pacific).
 */
export function HelpMessagesScreen({
  page,
  show,
}: {
  page: HelpMessagesPage;
  show: HelpMessageShow;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mark(id: string, done: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await setHelpMessageStatus({ data: { id, done } });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update that message — try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[640px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          Help messages
        </h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          Bug reports and feature requests sent with the Help button. Each one was also emailed to
          you. Mark it done when it's handled; the bell counts the ones still waiting. Only you, the
          super admin, see this page.
        </p>
      </div>

      <div role="tablist" aria-label="Show" className="flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            to="/guild/help"
            search={{ show: tab.value }}
            role="tab"
            aria-selected={show === tab.value}
            className={show === tab.value ? darkButtonClass : lightButtonClass}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      {page.messages.length === 0 ? (
        <div className="rounded-[14px] border border-canvas-border bg-white px-6 py-8 text-center text-sm text-ink-muted">
          {show === "waiting" ? "Nothing waiting. All caught up." : "No messages here yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "flex flex-col gap-3 rounded-[14px] border bg-white px-4 py-4 md:px-5",
                message.status === "waiting"
                  ? "border-canvas-border"
                  : "border-[#EFEAE1] opacity-80",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
                    message.kind === "bug"
                      ? "bg-[#FBE3D6] text-[#8F4517]"
                      : "bg-[#E1ECDF] text-[#2F5E2B]",
                  )}
                >
                  {message.kind === "bug" ? "Problem/bug" : "Feature request"}
                </span>
                <span className="text-[13px] font-semibold text-ink">
                  {message.memberName ??
                    (message.sentByGuildAdmin ? "Guild admin screens" : "No profile")}
                </span>
                <span className="text-[12px] text-ink-muted">{formatWhen(message.createdAt)}</span>
                {message.status === "done" && (
                  <span className="text-[12px] text-ink-muted">
                    · Done{message.handledAt ? ` ${formatWhen(message.handledAt)}` : ""}
                  </span>
                )}
              </div>

              <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-ink">
                {message.message}
              </p>

              <div className="flex flex-col gap-0.5 text-[12px] text-ink-muted">
                <span className="break-all">
                  From {message.firstName} &lt;{message.email}&gt;
                  {message.sentByGuildAdmin ? " · Guild admin" : ""}
                </span>
                {message.pagePath && <span className="break-all">Page: {message.pagePath}</span>}
                {message.userAgent && (
                  <span className="break-all">Device: {message.userAgent}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <a href={replyHref(message)} className={lightButtonClass}>
                  Reply by email
                </a>
                {message.status === "waiting" ? (
                  <button
                    type="button"
                    disabled={busyId === message.id}
                    onClick={() => mark(message.id, true)}
                    className={darkButtonClass}
                  >
                    {busyId === message.id ? "Saving…" : "Mark as done"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === message.id}
                    onClick={() => mark(message.id, false)}
                    className={lightButtonClass}
                  >
                    {busyId === message.id ? "Saving…" : "Move back to waiting"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {page.truncated && <p className="text-[12px] text-ink-muted">Showing the newest 200.</p>}
    </div>
  );
}
