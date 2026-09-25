import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite {businessName}</DialogTitle>
          <DialogDescription>
            There's no email on file for this member. Enter the address they should sign in with.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
              className="mt-1 h-11"
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11" disabled={sending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={sending || email.trim() === ""}>
              {sending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
