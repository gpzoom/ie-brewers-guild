import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import type { RosterEntry } from "@/lib/guild/roster.server";
import type { RosterBusiness } from "@/lib/guild/roster-groups";
import type { BusinessManagementMode } from "@/lib/supabase/types";
import { setBusinessMode, switchBusinessToOneManager } from "@/lib/guild/businesses.server";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NEW_MANAGER = "__new__";

const inputClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3 font-sans text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

/** One 44px radio row (the People role picker's size). */
function RadioRow({
  name,
  value,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[9px] px-2 text-[14px] text-ink hover:bg-canvas-2">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 accent-brand"
      />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}

/** The location whose look is kept by default: the earliest set up, else the first by city. */
function defaultLookSource(entries: RosterEntry[]): string {
  const byCity = [...entries].sort((a, b) => a.member.city.localeCompare(b.member.city));
  const setUp = byCity
    .filter((entry) => entry.member.setup_completed_at)
    .sort((a, b) => a.member.setup_completed_at!.localeCompare(b.member.setup_completed_at!));
  return (setUp[0] ?? byCity[0])?.member.id ?? "";
}

/**
 * The roster's Managed by boxes (artboard BZ1, spec 2026-10-15). To one
 * manager: who manages the business (a location's current owner, or
 * someone new) and whose logo, cover and theme every location keeps; one
 * server call does the switch, the links and the invite email. To
 * separate: a confirmation. The database refuses what its rules don't
 * allow (e.g. a pending hand-off) and the message shows here.
 */
export function BusinessModeDialog({
  business,
  entries,
  target,
  open,
  onOpenChange,
}: {
  business: RosterBusiness | null;
  entries: RosterEntry[];
  target: BusinessManagementMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const owners = useMemo(
    () =>
      [
        ...new Set(
          entries
            .filter((entry) => entry.ownerUserId)
            .map((entry) => entry.ownerEmail)
            .filter((email): email is string => Boolean(email)),
        ),
      ].sort(),
    [entries],
  );
  const lookDefault = useMemo(() => defaultLookSource(entries), [entries]);
  const managerDefault = owners[0] ?? NEW_MANAGER;
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.member.city.localeCompare(b.member.city)),
    [entries],
  );

  const [manager, setManager] = useState(managerDefault);
  const [newEmail, setNewEmail] = useState("");
  const [lookSource, setLookSource] = useState(lookDefault);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setManager(managerDefault);
      setNewEmail("");
      setLookSource(lookDefault);
      setErrorMessage(null);
      setSaving(false);
    }
  }, [open, managerDefault, lookDefault]);

  const toOne = target === "one_manager";
  const email = manager === NEW_MANAGER ? newEmail.trim() : manager;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!business) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      if (toOne) {
        await switchBusinessToOneManager({
          data: { businessId: business.id, email, lookSource: lookSource || null },
        });
      } else {
        await setBusinessMode({ data: { businessId: business.id, mode: "separate" } });
      }
      await router.invalidate();
      toast.success(
        toOne
          ? `${business.name}: one manager. Invite sent to ${email}.`
          : `${business.name}: each location separately`,
      );
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not switch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[480px] sm:rounded-[14px]">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            {toOne ? `Switch ${business?.name ?? "this business"} to one manager` : "Switch to each location separately"}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            {toOne
              ? `One person runs all ${entries.length} locations and the logo, cover and theme are shared.`
              : "Each location keeps its current logo, cover, theme and owner. To give a location to someone new, the manager hands it off first."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {toOne && (
            <>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-[13px] font-medium text-ink">Who manages the business?</legend>
                {owners.map((owner) => (
                  <RadioRow
                    key={owner}
                    name="mode-manager"
                    value={owner}
                    checked={manager === owner}
                    disabled={saving}
                    onChange={() => setManager(owner)}
                  >
                    {owner}
                  </RadioRow>
                ))}
                <RadioRow
                  name="mode-manager"
                  value={NEW_MANAGER}
                  checked={manager === NEW_MANAGER}
                  disabled={saving}
                  onChange={() => setManager(NEW_MANAGER)}
                >
                  Invite someone new
                </RadioRow>
                {manager === NEW_MANAGER && (
                  <div className="flex flex-col gap-2 px-2 pt-1">
                    <label htmlFor="mode-new-email" className="text-[13px] font-medium text-ink">
                      Their email
                    </label>
                    <input
                      id="mode-new-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      disabled={saving}
                      autoComplete="off"
                      className={inputClass}
                    />
                  </div>
                )}
              </fieldset>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-[13px] font-medium text-ink">Keep the logo, cover and theme from:</legend>
                {sortedEntries.map((entry) => (
                  <RadioRow
                    key={entry.member.id}
                    name="mode-look"
                    value={entry.member.id}
                    checked={lookSource === entry.member.id}
                    disabled={saving}
                    onChange={() => setLookSource(entry.member.id)}
                  >
                    {entry.member.city}
                  </RadioRow>
                ))}
              </fieldset>
            </>
          )}
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
              disabled={saving || !business || (toOne && !email)}
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? "Switching…" : "Switch"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
