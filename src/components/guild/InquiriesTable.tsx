import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  markInquiryHandled,
  setUpInquiryAsMember,
  type InquiryFilter,
} from "@/lib/guild/inquiries.server";
import { resolveConfirmationDisplayState } from "@/lib/inquiries/confirmation-state";
import type { InquiryRow, MemberType } from "@/lib/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FILTERS: { value: InquiryFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "handled", label: "Handled" },
  { value: "all", label: "All" },
];

const EMPTY_MESSAGE: Record<InquiryFilter, string> = {
  open: "Nothing waiting. New messages from the contact form land here.",
  handled: "No handled inquiries yet.",
  all: "No inquiries yet. Messages from the contact form land here.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink no-underline transition-colors hover:bg-canvas-2 disabled:opacity-60";

const accentButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60";

function WantsToJoinPill() {
  return (
    <span className="shrink-0 rounded-full bg-[#F5E2D0] px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.1em] text-[#7A4413]">
      Wants to join
    </span>
  );
}

function HandledPill() {
  return (
    <span className="shrink-0 rounded-full bg-canvas-2 px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
      Handled
    </span>
  );
}

/**
 * Guild admin inquiries (artboard N, GuildApprovals): everything sent
 * through the contact form, newest first, with membership interest
 * flagged. Open / Handled / All filter buttons; each inquiry is a card that
 * opens with "Read" to show the message and its actions (reply by email,
 * mark handled, set them up as a member).
 */
export function InquiriesTable({
  inquiries,
  filter,
  onFilterChange,
}: {
  inquiries: InquiryRow[];
  filter: InquiryFilter;
  onFilterChange: (filter: InquiryFilter) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(inquiries[0] ? [inquiries[0].id] : []),
  );
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [setUpTarget, setSetUpTarget] = useState<InquiryRow | null>(null);
  const [setUpOpen, setSetUpOpen] = useState(false);
  const [now] = useState(() => Date.now());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMarkHandled(inquiry: InquiryRow) {
    setHandlingId(inquiry.id);
    try {
      await markInquiryHandled({ data: { inquiryId: inquiry.id } });
      await router.invalidate();
      toast.success(`Marked ${inquiry.name}'s inquiry as handled`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark this inquiry as handled.");
    } finally {
      setHandlingId(null);
    }
  }

  function openSetUp(inquiry: InquiryRow) {
    setSetUpTarget(inquiry);
    setSetUpOpen(true);
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex max-w-[640px] flex-col gap-1.5">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Inquiries
          </h1>
          <p className="text-pretty text-[13px] text-[#564E45]">
            Everything sent through the contact form. Membership interest is flagged so it doesn't
            get lost among general questions.
          </p>
        </div>
        <div role="group" aria-label="Show inquiries" className="flex shrink-0 gap-2">
          {FILTERS.map(({ value, label }) => {
            const active = value === filter;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(value)}
                className={`inline-flex h-11 items-center rounded-[9px] border px-[15px] text-[13px] transition-colors md:h-[42px] ${
                  active
                    ? "border-ink bg-ink font-semibold text-canvas"
                    : "border-canvas-border bg-white text-ink hover:bg-canvas-2"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {inquiries.length === 0 && (
        <div className="rounded-[14px] border border-canvas-border bg-white px-6 py-8 text-center text-sm text-ink-muted">
          {EMPTY_MESSAGE[filter]}
        </div>
      )}

      {inquiries.map((inquiry) => {
        const isOpen = expanded.has(inquiry.id);
        const confirmationState = resolveConfirmationDisplayState({
          confirmationSentAt: inquiry.confirmation_sent_at,
          createdAt: inquiry.created_at,
          now,
        });
        const confirmationText =
          confirmationState === "sent" && inquiry.confirmation_sent_at
            ? `Confirmation email sent automatically at ${formatTime(inquiry.confirmation_sent_at)}`
            : confirmationState === "failed_to_send"
              ? "Confirmation email failed to send"
              : "Confirmation email not yet sent";

        if (!isOpen) {
          return (
            <div
              key={inquiry.id}
              className="flex items-center gap-[18px] rounded-[14px] border border-canvas-border bg-white px-5 py-[18px] md:px-6"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-base font-semibold text-ink">{inquiry.name}</span>
                  {inquiry.wants_membership_info && <WantsToJoinPill />}
                  {inquiry.status === "handled" && <HandledPill />}
                </div>
                <div className="break-words text-[13px] text-ink-muted">
                  {inquiry.email} · {formatDate(inquiry.created_at)}
                  {!inquiry.wants_membership_info && " · general question"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(inquiry.id)}
                aria-expanded={false}
                className={lightButtonClass}
              >
                Read
              </button>
            </div>
          );
        }

        return (
          <article
            key={inquiry.id}
            className="flex flex-col gap-3.5 rounded-[14px] border border-canvas-border bg-white px-5 py-[22px] md:px-6"
          >
            <div className="flex items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-xl font-bold text-ink">{inquiry.name}</h2>
                  {inquiry.wants_membership_info && <WantsToJoinPill />}
                  {inquiry.status === "handled" && <HandledPill />}
                </div>
                <div className="break-words text-[13px] text-ink-muted">
                  <a
                    href={`mailto:${inquiry.email}`}
                    className="text-ink-muted underline-offset-2 hover:underline"
                  >
                    {inquiry.email}
                  </a>
                  {inquiry.phone && (
                    <>
                      {" · "}
                      <a
                        href={`tel:${inquiry.phone}`}
                        className="text-ink-muted underline-offset-2 hover:underline"
                      >
                        {inquiry.phone}
                      </a>
                    </>
                  )}
                  {" · "}
                  {formatDateTime(inquiry.created_at)}
                </div>
                {inquiry.message ? (
                  <p className="whitespace-pre-line text-pretty text-sm leading-[1.55] text-[#3A332C]">
                    {inquiry.message}
                  </p>
                ) : (
                  <p className="text-sm italic text-ink-subtle">
                    No message — they only left their details.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggle(inquiry.id)}
                aria-expanded={true}
                className="inline-flex h-11 shrink-0 items-center rounded-[9px] px-3 text-[13px] text-ink-muted transition-colors hover:bg-canvas-2 hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-1">
              <div
                className={`text-xs ${confirmationState === "failed_to_send" ? "font-medium text-danger" : "text-ink-subtle"}`}
              >
                {confirmationText}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <a href={`mailto:${inquiry.email}`} className={lightButtonClass}>
                  Reply by email
                </a>
                {inquiry.status === "open" && (
                  <button
                    type="button"
                    onClick={() => handleMarkHandled(inquiry)}
                    disabled={handlingId === inquiry.id}
                    className={lightButtonClass}
                  >
                    {handlingId === inquiry.id ? "Saving…" : "Mark handled"}
                  </button>
                )}
                {inquiry.converted_member_id ? (
                  <span className="text-[13px] font-medium text-ink-muted">Set up as a member</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSetUp(inquiry)}
                    className={accentButtonClass}
                  >
                    Set them up as a member
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}

      <div className="flex items-start gap-3 rounded-[11px] bg-canvas-2 px-[18px] py-4">
        <InfoIcon />
        <p className="text-pretty text-[13px] leading-[1.55] text-[#3A332C]">
          <strong className="font-semibold">Applications are not switched on yet.</strong> Joining
          is arranged off the site for now — you set a member up from here and they get a sign-in
          link. When the Guild is ready to take applications online, that queue turns on beside this
          one and members apply for themselves.
        </p>
      </div>

      <SetUpMemberDialog
        inquiry={setUpTarget}
        open={setUpOpen}
        onOpenChange={setSetUpOpen}
        onDone={async () => {
          await router.invalidate();
        }}
      />
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-px shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" stroke="#6B6156" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.9v.9" stroke="#6B6156" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const fieldLabelClass = "text-[13px] font-medium text-ink";
const fieldInputClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

/**
 * "Set them up as a member": an inquiry has no city or member type, so the
 * admin supplies both here; the new member's name and contact email come
 * from the inquiry (inquiries.server.ts's setUpInquiryAsMember).
 */
function SetUpMemberDialog({
  inquiry,
  open,
  onOpenChange,
  onDone,
}: {
  inquiry: InquiryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [city, setCity] = useState("");
  const [memberType, setMemberType] = useState<MemberType>("producer");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCity("");
      setMemberType("producer");
      setErrorMessage(null);
      setSubmitting(false);
    }
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!inquiry) return;
    const trimmedCity = city.trim();
    if (!trimmedCity) {
      setErrorMessage("Enter the member's city.");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await setUpInquiryAsMember({
        data: { inquiryId: inquiry.id, city: trimmedCity, memberType },
      });
      onOpenChange(false);
      await onDone();
      toast.success(`${inquiry.name} is set up as a draft member. Invite them from Members.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not set up this inquiry as a member.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[480px] sm:rounded-[14px]">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Set up {inquiry?.name ?? ""} as a member
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            Creates a draft member named "{inquiry?.name}" with {inquiry?.email} as their contact
            email. Invite them from Members when you're ready.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="setup-member-city" className={fieldLabelClass}>
              City
            </label>
            <input
              id="setup-member-city"
              autoFocus
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={submitting}
              className={fieldInputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="setup-member-type" className={fieldLabelClass}>
              Member type
            </label>
            <select
              id="setup-member-type"
              value={memberType}
              onChange={(e) => setMemberType(e.target.value as MemberType)}
              disabled={submitting}
              className={`${fieldInputClass} px-3`}
            >
              <option value="producer">Producer</option>
              <option value="mobile">Mobile</option>
              <option value="allied">Allied Member</option>
            </select>
          </div>
          {errorMessage && (
            <p role="alert" className="text-[13px] text-danger">
              {errorMessage}
            </p>
          )}
          <DialogFooter className="gap-2 pt-1 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className={lightButtonClass}
            >
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={accentButtonClass}>
              {submitting ? "Setting up…" : "Set up member"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
