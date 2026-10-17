import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createMemberRecord } from "@/lib/guild/create-member.server";
import type { MemberType } from "@/lib/supabase/types";
import type { RosterBusiness } from "@/lib/guild/roster-groups";
import type { RosterEntry } from "@/lib/guild/roster.server";
import { addMemberPartOf, addMemberToast } from "@/lib/guild/member-part-of";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const labelClass = "text-[13px] font-medium text-ink";
const inputClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

/**
 * "Add a member" (artboard P's accent button). The created row starts as
 * status = 'draft' (create-member.server.ts, this plan's Decision 8) --
 * the member gets invited next from the roster and publishes their own
 * profile from there.
 */
export function CreateMemberDialog({
  businesses,
  singles,
}: {
  businesses: RosterBusiness[];
  /** Single-location members, offered as "Group with …". */
  singles: RosterEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [memberType, setMemberType] = useState<MemberType | "">("");
  const [contactEmail, setContactEmail] = useState("");
  // Part of: follows the typed business name until the admin picks
  // something by hand (null = untouched). See addMemberPartOf.
  const [partOfChoice, setPartOfChoice] = useState<string | null>(null);
  const partOf = addMemberPartOf({
    typedName: businessName,
    businesses,
    singles: singles.map((s) => ({ id: s.member.id, name: s.member.business_name })),
    choice: partOfChoice,
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!memberType) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { partOfError } = await createMemberRecord({
        data: {
          businessName,
          city,
          memberType,
          contactEmail: contactEmail || null,
          partOf: partOf.send,
        },
      });
      const created = businessName;
      setOpen(false);
      setBusinessName("");
      setCity("");
      setMemberType("");
      setContactEmail("");
      setPartOfChoice(null);
      await router.invalidate();
      // A Part of refusal still means the member was added: close, and warn.
      const outcome = addMemberToast(created, partOfError);
      if (outcome.kind === "warning") toast.warning(outcome.message);
      else toast.success(outcome.message);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create the member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && setOpen(next)}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Add a member
        </button>
      </DialogTrigger>
      <DialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[480px] sm:rounded-[14px]">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Add a member
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            They start as a draft. Invite them from the roster when you're ready, and they'll
            publish their own profile.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="new-member-business-name" className={labelClass}>
              Business name
            </label>
            <input
              id="new-member-business-name"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="new-member-city" className={labelClass}>
              City
            </label>
            <input
              id="new-member-city"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="new-member-type" className={labelClass}>
              Member type
            </label>
            <select
              id="new-member-type"
              value={memberType}
              onChange={(e) => setMemberType(e.target.value as MemberType | "")}
              disabled={submitting}
              className={`${inputClass} px-3`}
            >
              <option value="">Choose a type</option>
              <option value="producer">Producer</option>
              <option value="mobile">Mobile</option>
              <option value="allied">Affiliate Member</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="new-member-part-of" className={labelClass}>
              Part of
            </label>
            <select
              id="new-member-part-of"
              value={partOf.selected}
              onChange={(e) => setPartOfChoice(e.target.value)}
              disabled={submitting}
              className={`${inputClass} px-3`}
            >
              <option value="">None — a single location</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
              {singles.map((single) => (
                <option key={single.member.id} value={single.member.id}>
                  Group with {single.member.business_name} ({single.member.city})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="new-member-contact-email" className={labelClass}>
              Contact email <span className="font-normal text-ink-subtle">(optional)</span>
            </label>
            <input
              id="new-member-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-[13px] text-danger">
              {errorMessage}
            </p>
          )}
          <DialogFooter className="gap-2 pt-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !memberType}
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add member"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
