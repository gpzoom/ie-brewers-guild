import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { deleteMember } from "@/lib/guild/delete-member.server";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Roster "Delete" confirmation. Typing the exact business name is required
 * before the destructive button enables, since this removes the member,
 * all their content, and their sign-in account for good.
 *
 * Uncontrolled (no `open` prop) it renders its own "Delete" trigger button;
 * controlled (`open` + `onOpenChange`, as the roster's "More" menu uses it)
 * it renders only the dialog.
 */
export function DeleteMemberDialog({
  memberId,
  businessName,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  memberId: string;
  businessName: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const confirmed = confirmText.trim() === businessName.trim();
  const inputId = `delete-confirm-${memberId}`;

  useEffect(() => {
    if (open) {
      setConfirmText("");
      setErrorMessage(null);
    }
  }, [open, memberId]);

  function setOpen(next: boolean) {
    if (isControlled) controlledOnOpenChange?.(next);
    else setInternalOpen(next);
  }

  function onOpenChange(next: boolean) {
    if (deleting) return;
    setOpen(next);
  }

  async function onDelete() {
    if (!confirmed) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      await deleteMember({ data: { memberId } });
      setOpen(false);
      await router.invalidate();
      toast.success(`Deleted ${businessName}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not delete this member.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {!isControlled && (
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="inline-flex h-11 items-center rounded-lg border border-danger/40 bg-white px-[13px] text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            Delete
          </button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[480px] sm:rounded-[14px]">
        <AlertDialogHeader className="gap-1.5 text-left">
          <AlertDialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Delete {businessName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            This permanently removes the member's profile, hours, links, events, photos, and the
            member's sign-in account. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-[13px] font-medium text-ink">
            Type <span className="font-semibold">{businessName}</span> to confirm
          </label>
          <input
            id={inputId}
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onDelete();
              }
            }}
            disabled={deleting}
            className="h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-60"
          />
        </div>
        {errorMessage && (
          <p role="alert" className="text-[13px] text-danger">
            {errorMessage}
          </p>
        )}
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            className="mt-0 h-11 rounded-[9px] border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink hover:bg-canvas-2"
            disabled={deleting}
          >
            Cancel
          </AlertDialogCancel>
          <button
            type="button"
            disabled={!confirmed || deleting}
            onClick={onDelete}
            className="inline-flex h-11 items-center justify-center rounded-[9px] bg-danger px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
