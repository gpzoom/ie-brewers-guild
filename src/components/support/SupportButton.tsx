import { useState, type FormEvent } from "react";
import {
  getSupportContext,
  sendSupportMessage,
  type SupportContext,
} from "@/lib/support/support-message.server";
import {
  SUPPORT_FIRST_NAME_MAX,
  SUPPORT_KIND_LABEL,
  SUPPORT_MESSAGE_MAX,
  validateSupportMessage,
  type SupportFieldErrors,
  type SupportMessageKind,
} from "@/lib/support/support-message";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const inputClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const labelClass = "text-[13px] font-medium text-ink";
const secondaryClass =
  "inline-flex h-[46px] items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";
const primaryClass =
  "inline-flex h-[46px] items-center justify-center rounded-[9px] bg-brand px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#DED7CB] disabled:text-[#8C8275]";

// The first name is remembered in this browser only, as a convenience.
const FIRST_NAME_KEY = "support_first_name";
function readRememberedName(): string {
  try {
    return window.localStorage.getItem(FIRST_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function rememberName(name: string) {
  try {
    window.localStorage.setItem(FIRST_NAME_KEY, name);
  } catch {
    /* private window: nothing to remember */
  }
}

const KINDS: SupportMessageKind[] = ["bug", "feature"];

/**
 * The Help button (docs/member-profiles.md, "Help button"; artboard X): a
 * tab on the right edge of every member portal, /admin and Guild screen
 * (mounted once in __root.tsx). It opens a short form -- first name, email,
 * Problem/bug or Feature request, and a description -- that is saved and
 * emailed to the site owner. The profile they're working on comes from the
 * session, so it's shown, not asked.
 */
export function SupportButton({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<SupportContext | null>(null);
  const [kind, setKind] = useState<SupportMessageKind | null>(null);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<SupportFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function openForm() {
    setKind(null);
    setMessage("");
    setErrors({});
    setFormError(null);
    setSent(false);
    setFirstName((current) => current || readRememberedName());
    setOpen(true);
    try {
      const next = await getSupportContext({ data: { pagePath: pathname } });
      setContext(next);
      if (next.signedIn && next.email) setEmail((current) => current || next.email || "");
    } catch {
      setContext(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const input = { kind, firstName, email, message, pagePath: pathname };
    const checked = validateSupportMessage(input);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setSending(true);
    setErrors({});
    setFormError(null);
    try {
      const result = await sendSupportMessage({ data: checked.value });
      if (result.ok) {
        rememberName(checked.value.firstName);
        setSent(true);
      } else {
        setErrors(result.errors);
        setFormError(result.formError ?? null);
      }
    } catch {
      setFormError("Couldn't send your message — try again.");
    } finally {
      setSending(false);
    }
  }

  const memberName = context?.signedIn ? context.memberName : null;

  return (
    <>
      <button
        type="button"
        onClick={openForm}
        className="fixed right-0 top-1/2 z-30 flex min-h-11 -translate-y-1/2 items-center rounded-l-[9px] bg-ink px-2 py-3 text-[13px] font-semibold tracking-[0.04em] text-white shadow-md transition-colors [writing-mode:vertical-rl] hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 print:hidden"
      >
        Help
      </button>

      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent className="max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[520px] gap-5 overflow-y-auto rounded-[18px] border-0 bg-canvas p-6 text-ink sm:rounded-[18px] sm:p-[30px]">
          {sent ? (
            <div className="flex flex-col gap-5" role="status">
              <DialogHeader className="gap-2 space-y-0 pr-6 text-left">
                <DialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
                  Thanks, we got it
                </DialogTitle>
                <DialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
                  Your message is on its way. If we need more detail, we'll reply to {email.trim()}.
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(primaryClass, "self-end")}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <DialogHeader className="gap-2 space-y-0 pr-6 text-left">
                <DialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
                  Help
                </DialogTitle>
                <DialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
                  Found a problem, or have an idea? Tell us here and it goes straight to the person
                  who looks after the website.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
                {memberName && (
                  <p className="rounded-[9px] bg-canvas-2 px-3.5 py-2.5 text-[13px] text-ink-muted">
                    About: <strong className="font-semibold text-ink">{memberName}</strong>
                  </p>
                )}

                <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
                  <legend className={cn(labelClass, "mb-2.5 p-0")}>What is this about?</legend>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {KINDS.map((value) => {
                      const checked = kind === value;
                      return (
                        <label
                          key={value}
                          className={cn(
                            "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[12px] bg-white",
                            checked
                              ? "border-2 border-ink px-[15px]"
                              : "border border-canvas-border px-4",
                          )}
                        >
                          <input
                            type="radio"
                            name="support_kind"
                            value={value}
                            checked={checked}
                            disabled={sending}
                            onChange={() => setKind(value)}
                            className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-ink"
                          />
                          <span className="text-[15px] font-semibold text-ink">
                            {SUPPORT_KIND_LABEL[value]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.kind && <p className="text-[13px] text-danger">{errors.kind}</p>}
                </fieldset>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="support-first-name" className={labelClass}>
                      First name
                    </label>
                    <input
                      id="support-first-name"
                      value={firstName}
                      maxLength={SUPPORT_FIRST_NAME_MAX}
                      autoComplete="given-name"
                      disabled={sending}
                      onChange={(e) => setFirstName(e.target.value)}
                      aria-invalid={!!errors.firstName}
                      className={inputClass}
                    />
                    {errors.firstName && (
                      <p className="text-[13px] text-danger">{errors.firstName}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="support-email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="support-email"
                      type="email"
                      value={email}
                      autoComplete="email"
                      disabled={sending}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={!!errors.email}
                      className={inputClass}
                    />
                    {errors.email && <p className="text-[13px] text-danger">{errors.email}</p>}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="support-message" className={labelClass}>
                    {kind === "feature" ? "Describe your suggestion" : "Describe the problem"}
                  </label>
                  <textarea
                    id="support-message"
                    value={message}
                    maxLength={SUPPORT_MESSAGE_MAX}
                    disabled={sending}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    aria-invalid={!!errors.message}
                    placeholder={
                      kind === "feature"
                        ? "What would you like the site to do?"
                        : "What were you doing, and what went wrong?"
                    }
                    className="w-full rounded-[9px] border border-canvas-border bg-white px-3.5 py-3 font-sans text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                  {errors.message && <p className="text-[13px] text-danger">{errors.message}</p>}
                  <p className="text-[12px] text-ink-subtle">
                    The page you're on and your browser are sent along, to help track down problems.
                  </p>
                </div>

                {formError && (
                  <p role="alert" className="text-[13px] text-danger">
                    {formError}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => setOpen(false)}
                    className={secondaryClass}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={sending} className={primaryClass}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
