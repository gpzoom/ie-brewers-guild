import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  cancelPortalInvite,
  invitePortalPerson,
  removePortalPerson,
  resendPortalInvite,
} from "@/lib/portal/portal-people.server";
import type { InviteRole, PeopleView, PersonView } from "@/lib/portal/people";
import type { PortalRole } from "@/lib/portal/portal-destination";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<PortalRole, string> = {
  owner: "Owner",
  editor: "Full editor",
  media_events: "Photos & events",
};

const ROLE_HELP: Record<InviteRole, string> = {
  media_events: "Photos & video and Events. They can publish photo changes, nothing else.",
  editor: "Everything on the profile except People. They can publish all changes.",
};

const sectionLabelClass =
  "font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted";
const rowButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] px-3 text-[13px] font-medium text-ink-muted transition-colors hover:bg-canvas-2 hover:text-ink disabled:opacity-60";
const primaryClass =
  "inline-flex h-[46px] items-center justify-center rounded-[9px] bg-brand px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#DED7CB] disabled:text-[#8C8275]";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function RolePill({ role }: { role: PortalRole }) {
  return (
    <span className="shrink-0 rounded-full bg-canvas-2 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
      {ROLE_LABEL[role]}
    </span>
  );
}

/**
 * The owner's People section (docs/member-profiles.md, "The People
 * section"; Roles map in docs/design/onboarding/Roles.dc.html): everyone on
 * the profile with their role, pending invites with Resend and Cancel
 * invite, Remove for everyone but the owner, and the invite form (email +
 * Photos & events / Full editor). Every action is checked again on the
 * server (portal-people.server.ts); after each one the page reloads its
 * list.
 */
export function PeopleSection({ people, invites }: PeopleView) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("media_events");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PersonView | null>(null);

  async function run(id: string, action: () => Promise<string | null>) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      await router.invalidate();
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await invitePortalPerson({ data: { email, role } });
      setEmail("");
      await router.invalidate();
      setNotice(
        result.emailSent
          ? `Invite sent to ${result.email}.`
          : `Invite saved for ${result.email}, but the email didn't go out. Try Resend.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the invite — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">
          People
        </h1>
        <p className="text-pretty text-[13px] text-ink-muted">
          Who can edit this profile. Only you, the owner, see this page. To change someone's access,
          remove them and invite them again.
        </p>
      </header>

      <section aria-labelledby="people-heading" className="flex flex-col gap-3">
        <h2 id="people-heading" className={sectionLabelClass}>
          On this profile
        </h2>
        <ul className="flex flex-col overflow-hidden rounded-[12px] border border-canvas-border bg-white">
          {people.map((person) => (
            <li
              key={person.userId}
              className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-canvas-2 px-4 py-2.5 last:border-b-0"
            >
              <span className="min-w-0 break-all text-[14px] text-ink">
                {person.email ?? "Unknown address"}
                {person.isYou && <span className="text-ink-muted"> · you</span>}
              </span>
              <span className="flex items-center gap-1.5">
                <RolePill role={person.role} />
                {person.canRemove && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => setRemoving(person)}
                    className={rowButtonClass}
                  >
                    {busyId === person.userId ? "Removing…" : "Remove"}
                  </button>
                )}
              </span>
            </li>
          ))}
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-canvas-2 px-4 py-2.5 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col">
                <span className="break-all text-[14px] text-ink">{invite.email}</span>
                <span
                  className={cn("text-[12px]", invite.expired ? "text-danger" : "text-ink-muted")}
                >
                  {invite.expired
                    ? "Invite expired. Resend it to give them another 14 days."
                    : `Invited, hasn't signed in yet · expires ${formatDate(invite.expiresAt)}`}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <RolePill role={invite.role} />
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() =>
                    run(invite.id, async () => {
                      const result = await resendPortalInvite({ data: { inviteId: invite.id } });
                      return result.emailSent
                        ? `Invite sent again to ${result.email}.`
                        : `Invite renewed for ${result.email}, but the email didn't go out. Try again.`;
                    })
                  }
                  className={rowButtonClass}
                >
                  {busyId === invite.id ? "Working…" : "Resend"}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() =>
                    run(invite.id, async () => {
                      await cancelPortalInvite({ data: { inviteId: invite.id } });
                      return `Canceled the invite to ${invite.email}.`;
                    })
                  }
                  className={rowButtonClass}
                >
                  Cancel invite
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={onInvite}
        noValidate
        aria-labelledby="invite-heading"
        className="flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-5 py-5 md:px-6"
      >
        <h2 id="invite-heading" className="font-sans text-base font-semibold text-ink">
          Invite someone
        </h2>
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-email" className="text-[13px] font-medium text-ink">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            disabled={sending}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-medium text-ink">Access</legend>
          {(["media_events", "editor"] as const).map((value) => {
            const checked = role === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[12px] bg-white",
                  checked
                    ? "border-2 border-ink px-[15px] py-[12px]"
                    : "border border-canvas-border px-4 py-[13px]",
                )}
              >
                <input
                  type="radio"
                  name="invite_role"
                  value={value}
                  checked={checked}
                  disabled={sending}
                  onChange={() => setRole(value)}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-ink"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-ink">
                    {value === "media_events" ? "Photos & events" : "Full editor"}
                  </span>
                  <span className="text-[12px] text-ink-muted">{ROLE_HELP[value]}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="text-[12px] text-ink-muted">
          They get an email with a Member Portal sign-in link. The invite lasts 14 days.
        </p>
        <div>
          <button type="submit" disabled={sending || email.trim() === ""} className={primaryClass}>
            {sending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {notice && <p className="text-[13px] font-medium text-ink">{notice}</p>}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>

      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent className="rounded-[18px] border-0 bg-canvas p-[30px] sm:rounded-[18px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
              Remove {removing?.email ?? "this person"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
              They lose access to this profile right away. Anything they already published stays
              live. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-[46px] rounded-[9px] border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink hover:bg-canvas-2">
              Keep them
            </AlertDialogCancel>
            <button
              type="button"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (!target) return;
                void run(target.userId, async () => {
                  await removePortalPerson({ data: { userId: target.userId } });
                  return `Removed ${target.email ?? "them"}.`;
                });
              }}
              className="inline-flex h-[46px] items-center justify-center rounded-[9px] bg-danger px-6 text-[14px] font-semibold text-white"
            >
              Remove
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
