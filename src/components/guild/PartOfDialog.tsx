import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import type { RosterEntry } from "@/lib/guild/roster.server";
import type { RosterBusiness } from "@/lib/guild/roster-groups";
import { setMemberBusiness } from "@/lib/guild/businesses.server";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The roster's "Part of…" (spec 2026-10-15): put a location under a
 * business, group it with another single location (which makes a new
 * business of the two), or make it a single location again. Leaving a
 * one-manager business releases the location from its manager. The database
 * refuses what the rules don't allow and that message shows in the dialog.
 */
export function PartOfDialog({
  entry,
  businesses,
  singles,
  open,
  onOpenChange,
}: {
  entry: RosterEntry | null;
  businesses: RosterBusiness[];
  singles: RosterEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const current = entry?.member.business_id ?? "";
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(current);
      setErrorMessage(null);
      setSaving(false);
    }
  }, [open, current]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entry) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await setMemberBusiness({ data: { memberId: entry.member.id, target: value || null } });
      await router.invalidate();
      toast.success("Saved");
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const others = singles.filter((single) => single.member.id !== entry?.member.id);

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[480px] sm:rounded-[14px]">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Part of
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            {entry
              ? `Choose the business ${entry.member.business_name} (${entry.member.city}) belongs to.`
              : "Choose the business this location belongs to."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="part-of-target" className="text-[13px] font-medium text-ink">
              Part of
            </label>
            <select
              id="part-of-target"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              className="h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3 font-sans text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              <option value="">None — a single location</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
              {others.map((single) => (
                <option key={single.member.id} value={single.member.id}>
                  Group with {single.member.business_name} ({single.member.city})
                </option>
              ))}
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
              disabled={saving}
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !entry || value === current}
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
