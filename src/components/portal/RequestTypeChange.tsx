import { useState, type FormEvent } from "react";
import {
  requestTypeChange,
  TYPE_CHANGE_NOTE_MAX,
  type TypeChangeRequestSummary,
} from "@/lib/portal/type-change.server";
import { MEMBER_TYPE_OPTIONS, MEMBER_TYPE_SHORT_LABEL } from "@/lib/members/member-type-options";
import type { MemberType } from "@/lib/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

const dialogButtonClass =
  "inline-flex h-[46px] items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";
const dialogPrimaryClass =
  "inline-flex h-[46px] items-center justify-center rounded-[9px] bg-brand px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#DED7CB] disabled:text-[#8C8275]";

/**
 * Portal Basics: "Request a type change" (docs/member-profiles.md, "Member
 * type: confirm once, then locked"). Opens a dialog with the other two
 * types and an optional note; sending files a support request and emails
 * the Guild (requestTypeChange). While a request is open, it says so
 * instead of offering another.
 */
export function RequestTypeChange({
  currentType,
  initialRequest,
}: {
  currentType: MemberType;
  initialRequest: TypeChangeRequestSummary | null;
}) {
  const [request, setRequest] = useState(initialRequest);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<MemberType | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (request) {
    return (
      <p className="font-medium text-ink" role="status">
        You asked to change to {MEMBER_TYPE_SHORT_LABEL[request.requestedType]} on{" "}
        {formatDate(request.createdAt)}. The Guild will be in touch.
      </p>
    );
  }

  function openDialog() {
    setChoice(null);
    setNote("");
    setError(null);
    setOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!choice) {
      setError("Choose the type you'd like to be.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const sent = await requestTypeChange({ data: { memberType: choice, note } });
      setRequest(sent);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your request — try again.");
    } finally {
      setSending(false);
    }
  }

  const options = MEMBER_TYPE_OPTIONS.filter((option) => option.value !== currentType);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="min-h-11 text-left text-[13px] font-semibold text-brand underline-offset-2 hover:text-brand-hover hover:underline"
      >
        Request a type change
      </button>

      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent className="max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[560px] gap-5 overflow-y-auto rounded-[18px] border-0 bg-canvas p-6 text-ink sm:rounded-[18px] sm:p-[30px]">
          <DialogHeader className="gap-2 space-y-0 pr-6 text-left">
            <DialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
              Request a type change
            </DialogTitle>
            <DialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
              You're listed as {MEMBER_TYPE_SHORT_LABEL[currentType]}. The Guild will review your
              request and make the change. Nothing you've filled in is deleted when your type
              changes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
              <legend className="mb-2.5 p-0 text-[13px] font-medium text-ink">
                What should your type be?
              </legend>
              {options.map((option) => {
                const checked = choice === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[12px] bg-white",
                      checked
                        ? "border-2 border-ink px-[15px] py-[13px]"
                        : "border border-canvas-border px-4 py-[14px]",
                    )}
                  >
                    <input
                      type="radio"
                      name="requested_type"
                      value={option.value}
                      checked={checked}
                      disabled={sending}
                      onChange={() => setChoice(option.value)}
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-ink"
                    />
                    <span className="flex flex-col gap-1">
                      <span className="text-[15px] font-semibold text-ink">{option.title}</span>
                      <span className="text-[13px] text-ink-muted">{option.description}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div className="flex flex-col gap-2">
              <label htmlFor="type-change-note" className="text-[13px] font-medium text-ink">
                Anything the Guild should know? <span className="text-ink-muted">(optional)</span>
              </label>
              <textarea
                id="type-change-note"
                value={note}
                maxLength={TYPE_CHANGE_NOTE_MAX}
                disabled={sending}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full rounded-[9px] border border-canvas-border bg-white px-3.5 py-3 font-sans text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>

            {error && (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={sending}
                onClick={() => setOpen(false)}
                className={dialogButtonClass}
              >
                Cancel
              </button>
              <button type="submit" disabled={sending} className={dialogPrimaryClass}>
                {sending ? "Sending…" : "Send request"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
