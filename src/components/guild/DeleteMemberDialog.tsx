import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Roster "Delete" button + confirmation. Typing the exact business name is
 * required before the destructive button enables, since this removes the
 * member, all their content, and their sign-in account for good.
 */
export function DeleteMemberDialog({ memberId, businessName }: { memberId: string; businessName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const confirmed = confirmText.trim() === businessName.trim();
  const inputId = `delete-confirm-${memberId}`;

  function onOpenChange(next: boolean) {
    if (deleting) return;
    setOpen(next);
    if (next) {
      setConfirmText("");
      setErrorMessage(null);
    }
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
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="min-h-11 rounded-md border border-danger/50 px-3 py-1 text-sm font-medium text-danger hover:bg-danger/10"
        >
          Delete
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {businessName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the member's profile, hours, links, events, photos, and the member's sign-in
            account. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <Label htmlFor={inputId}>
            Type <span className="font-semibold">{businessName}</span> to confirm
          </Label>
          <Input
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
            className="mt-1 h-11"
          />
        </div>
        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11" disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className="h-11 text-white"
            disabled={!confirmed || deleting}
            onClick={onDelete}
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
