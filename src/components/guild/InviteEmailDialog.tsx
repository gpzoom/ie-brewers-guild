import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Same basic shape check as member-email.server.ts / contact-form-validation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Asks for a sign-in email when a member has neither an owner account nor a
 * contact email on file. The typed address is ONLY used for the invite --
 * it is never written to members.contact_email, which is the member's
 * public contact address.
 */
export function InviteEmailDialog({
  businessName,
  open,
  onOpenChange,
  onSend,
}: {
  businessName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setErrorMessage(null);
      setSending(false);
    }
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    setSending(true);
    setErrorMessage(null);
    try {
      await onSend(trimmed);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[480px] sm:rounded-[14px]">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Invite {businessName}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            There's no email on file for this member. Enter the address they should sign in with.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="invite-email" className="text-[13px] font-medium text-ink">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              autoComplete="off"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
              className="h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            />
            <p className="text-xs text-ink-subtle">
              Only used for the invite — it isn't shown on their profile.
            </p>
          </div>
          {errorMessage && (
            <p role="alert" className="text-[13px] text-danger">
              {errorMessage}
            </p>
          )}
          <DialogFooter className="gap-2 pt-1 sm:gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || email.trim() === ""}
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send invite"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
