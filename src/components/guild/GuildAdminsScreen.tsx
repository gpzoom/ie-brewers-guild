import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  cancelGuildAdminInviteFn,
  inviteGuildAdminFn,
  removeGuildAdminFn,
  resendGuildAdminInviteFn,
} from "@/lib/guild/guild-admins.server";
import type { GuildAdminView, GuildAdminsView } from "@/lib/guild/guild-admins";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const headerLabelClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted";
const rowButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-canvas-border bg-canvas px-[13px] text-xs font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-50 md:h-10";
const accentButtonClass =
  "inline-flex h-[46px] shrink-0 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60";
const inputClass =
  "h-[46px] w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function Pill({ children, tone = "muted" }: { children: string; tone?: "muted" | "brand" }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.1em] ${
        tone === "brand" ? "bg-[#F5E2D0] text-[#7A4413]" : "bg-canvas-2 text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * The super admin's Guild admins screen (docs/member-profiles.md, "Super
 * admin" > "Guild admins screen"; docs/design/README.md has the layout
 * notes -- no artboard exists, so it follows the roster and inquiries
 * screens). Everyone with Guild admin access (email, date added, last
 * sign-in), pending invites with Resend and Cancel invite, the invite form,
 * and Remove access for everyone but the super admin. Every action is
 * checked again on the server.
 */
export function GuildAdminsScreen({ admins, invites }: GuildAdminsView) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<GuildAdminView | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  async function run(id: string, action: () => Promise<string>) {
    setBusyId(id);
    try {
      const message = await action();
      await router.invalidate();
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    try {
      const result = await inviteGuildAdminFn({ data: { email } });
      setEmail("");
      await router.invalidate();
      if (result.emailSent) toast.success(`Invite sent to ${result.email}.`);
      else toast.error(`Invite saved for ${result.email}, but the email didn't go out. Try Resend.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the invite — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[640px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          Guild admins
        </h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          Who can run the Guild side of the site: inquiries, the roster, editing members' profiles for
          them. Only you, the super admin, see this page.
        </p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-canvas-border bg-white">
        <div
          className="hidden items-center gap-4 border-b border-[#E6E0D6] bg-[#FCFAF6] px-5 py-3 md:flex"
          aria-hidden="true"
        >
          <div className={`min-w-0 flex-1 ${headerLabelClass}`}>Email</div>
          <div className={`w-28 ${headerLabelClass}`}>Added</div>
          <div className={`w-28 ${headerLabelClass}`}>Last sign-in</div>
          <div className="w-[132px]" />
        </div>
        <ul>
          {admins.map((admin) => (
            <li
              key={admin.userId}
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[#F0EBE3] px-4 py-[13px] last:border-b-0 md:flex-nowrap md:px-5"
            >
              <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 md:basis-auto">
                <span className="break-all text-[15px] font-medium text-ink">
                  {admin.email ?? "Unknown address"}
                </span>
                {admin.isSuperAdmin && <Pill tone="brand">Super admin</Pill>}
                {admin.isYou && <Pill>You</Pill>}
              </div>
              <div className="text-[13px] text-ink-muted md:w-28">
                <span className="md:hidden">Added </span>
                {formatDate(admin.addedAt)}
              </div>
              <div className="text-[13px] text-ink-muted md:w-28">
                <span className="md:hidden">· Last sign-in </span>
                {formatDate(admin.lastSignInAt)}
              </div>
              <div className="flex w-full justify-end md:w-[132px]">
                {admin.canRemove && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => {
                      setRemoving(admin);
                      setRemoveOpen(true);
                    }}
                    className={`${rowButtonClass} font-normal text-ink-muted`}
                  >
                    {busyId === admin.userId ? "Removing…" : "Remove access"}
                  </button>
                )}
              </div>
            </li>
          ))}
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[#F0EBE3] px-4 py-[13px] last:border-b-0 md:flex-nowrap md:px-5"
            >
              <div className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 md:basis-auto">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="break-all text-[15px] font-medium text-ink">{invite.email}</span>
                  <Pill>Invited</Pill>
                </span>
                <span className={`text-[12px] ${invite.expired ? "text-danger" : "text-ink-muted"}`}>
                  {invite.expired
                    ? "Invite expired. Resend it to give them another 14 days."
                    : `Hasn't signed in yet · expires ${formatDate(invite.expiresAt)}`}
                </span>
              </div>
              <div className="flex w-full justify-end gap-2 md:w-auto">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() =>
                    run(invite.id, async () => {
                      const result = await resendGuildAdminInviteFn({ data: { inviteId: invite.id } });
                      return result.emailSent
                        ? `Invite sent again to ${result.email}.`
                        : `Invite renewed for ${result.email}, but the email didn't go out.`;
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
                      await cancelGuildAdminInviteFn({ data: { inviteId: invite.id } });
                      return `Canceled the invite to ${invite.email}.`;
                    })
                  }
                  className={`${rowButtonClass} font-normal text-ink-muted`}
                >
                  Cancel invite
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <form
        onSubmit={onInvite}
        noValidate
        aria-labelledby="invite-admin-heading"
        className="flex max-w-[640px] flex-col gap-3 rounded-[14px] border border-canvas-border bg-white px-5 py-5 md:px-6"
      >
        <h2 id="invite-admin-heading" className="font-sans text-base font-semibold text-ink">
          Invite a Guild admin
        </h2>
        <label htmlFor="invite-admin-email" className="text-[13px] font-medium text-ink">
          Email
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="invite-admin-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            disabled={sending}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <button type="submit" disabled={sending || email.trim() === ""} className={accentButtonClass}>
            {sending ? "Sending…" : "Send invite"}
          </button>
        </div>
        <p className="text-[12px] leading-[1.5] text-ink-muted">
          They get an email with a sign-in link. Access starts when they sign in with that address. The
          invite lasts 14 days.
        </p>
      </form>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[460px] sm:rounded-[14px]">
          <AlertDialogHeader className="gap-1.5 text-left">
            <AlertDialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
              Remove {removing?.email ?? "this person"}'s access?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
              They stop being a Guild admin on their next click, including any "Edit as them" session
              they have open. Their account isn't deleted, and you can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0 h-11 rounded-[9px] border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink hover:bg-canvas-2">
              Keep them
            </AlertDialogCancel>
            <button
              type="button"
              onClick={() => {
                const target = removing;
                setRemoveOpen(false);
                if (!target) return;
                void run(target.userId, async () => {
                  await removeGuildAdminFn({ data: { userId: target.userId } });
                  return `Removed ${target.email ?? "their"} access.`;
                });
              }}
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-danger px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Remove access
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
