import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createMemberRecord } from "@/lib/guild/create-member.server";
import type { MemberType } from "@/lib/supabase/types";
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
export function CreateMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [memberType, setMemberType] = useState<MemberType>("producer");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await createMemberRecord({
        data: {
          businessName,
          city,
          memberType,
          contactEmail: contactEmail || null,
        },
      });
      const created = businessName;
      setOpen(false);
      setBusinessName("");
      setCity("");
      setContactEmail("");
      await router.invalidate();
      toast.success(`Added ${created}`);
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
              onChange={(e) => setMemberType(e.target.value as MemberType)}
              disabled={submitting}
              className={`${inputClass} px-3`}
            >
              <option value="producer">Producer</option>
              <option value="mobile">Mobile</option>
              <option value="allied">Allied Member</option>
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
              disabled={submitting}
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
