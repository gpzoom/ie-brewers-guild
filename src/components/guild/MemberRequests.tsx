import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  markSupportRequestHandled,
  type SupportRequestView,
} from "@/lib/guild/support-requests.server";
import { MEMBER_TYPE_SHORT_LABEL } from "@/lib/members/member-type-options";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink no-underline transition-colors hover:bg-canvas-2 disabled:opacity-60";

/**
 * Open requests from members' portals, above the contact-form inquiries
 * (plan phase 5, "Guild inquiries"). Today that's "Request a type change":
 * the member's type is locked for them once confirmed, so the Guild admin
 * makes the change from the roster, then marks the request handled here.
 * Hidden when there's nothing open.
 */
export function MemberRequests({ requests }: { requests: SupportRequestView[] }) {
  const router = useRouter();
  const [handlingId, setHandlingId] = useState<string | null>(null);
  if (requests.length === 0) return null;

  async function handle(request: SupportRequestView) {
    setHandlingId(request.id);
    try {
      await markSupportRequestHandled({ data: { requestId: request.id } });
      await router.invalidate();
      toast.success(`Marked ${request.memberName}'s request as handled`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't mark this request as handled.");
    } finally {
      setHandlingId(null);
    }
  }

  return (
    <section aria-labelledby="member-requests-heading" className="flex flex-col gap-3">
      <h2
        id="member-requests-heading"
        className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
      >
        Member requests · {requests.length} open
      </h2>
      {requests.map((request) => {
        const from = request.currentType ? MEMBER_TYPE_SHORT_LABEL[request.currentType] : "?";
        const to = request.requestedType ? MEMBER_TYPE_SHORT_LABEL[request.requestedType] : "?";
        return (
          <article
            key={request.id}
            className="flex flex-col gap-3 rounded-[14px] border border-canvas-border bg-white px-5 py-[18px] md:px-6"
          >
            <div className="flex flex-col gap-[5px]">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-base font-semibold text-ink">{request.memberName}</span>
                <span className="shrink-0 rounded-full bg-[#F5E2D0] px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.1em] text-[#7A4413]">
                  Type change
                </span>
              </div>
              <p className="text-[14px] text-ink">
                Wants to change from {from} to <strong className="font-semibold">{to}</strong>.
              </p>
              <p className="break-words text-[13px] text-ink-muted">
                {request.requestedByEmail ?? "Sent while editing as them"} ·{" "}
                {formatDate(request.createdAt)}
              </p>
              {request.note ? (
                <p className="whitespace-pre-line text-pretty text-sm leading-[1.55] text-[#3A332C]">
                  {request.note}
                </p>
              ) : (
                <p className="text-sm italic text-ink-subtle">No note.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link to="/guild/roster" className={lightButtonClass}>
                Open the roster
              </Link>
              <button
                type="button"
                disabled={handlingId === request.id}
                onClick={() => void handle(request)}
                className={lightButtonClass}
              >
                {handlingId === request.id ? "Saving…" : "Mark handled"}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
