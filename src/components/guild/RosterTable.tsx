import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import type { RosterEntry } from "@/lib/guild/roster.server";
import type { MemberStatus, MemberType } from "@/lib/supabase/types";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateMemberDialog } from "@/components/guild/CreateMemberDialog";
import { DeleteMemberDialog } from "@/components/guild/DeleteMemberDialog";
import { InviteEmailDialog } from "@/components/guild/InviteEmailDialog";
import { inviteMember } from "@/lib/guild/invite-member.server";
import { startImpersonation } from "@/lib/guild/impersonation.server";
import { computeHoursConfirmationBadge } from "@/lib/hours/publish-gate";
import {
  approveMember,
  declineMember,
  suspendMember,
  setTrailEligible,
  correctMemberType,
  setDuesReceived,
} from "@/lib/guild/member-admin-actions.server";

const MEMBER_TYPE_LABEL: Record<MemberType, string> = {
  producer: "Producer",
  mobile: "Mobile",
  allied: "Allied Member",
};

type RowStatus = { label: string; dot: string };

const STATUS_BY_MEMBER_STATUS: Record<Exclude<MemberStatus, "published">, RowStatus> = {
  draft: { label: "Draft", dot: "#A89D8E" },
  applied: { label: "Applied", dot: "#C98A2E" },
  declined: { label: "Declined", dot: "#8C8275" },
  suspended: { label: "Suspended", dot: "#C4552E" },
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Weekly hours only go stale for members that keep them (Mobile members list appearances instead). */
function hasStaleHours(entry: RosterEntry, now: Date): boolean {
  if (entry.member.member_type === "mobile") return false;
  return computeHoursConfirmationBadge(entry.member.hours_confirmed_at, now).kind === "stale";
}

/** The status dot + label (artboard P): the member's status, with a published profile's loose ends called out. */
function resolveRowStatus(entry: RosterEntry, now: Date): RowStatus {
  const { member } = entry;
  if (member.status !== "published") return STATUS_BY_MEMBER_STATUS[member.status];
  if (hasStaleHours(entry, now)) return { label: "Stale hours", dot: "#C98A2E" };
  if (!member.dues_received_at) return { label: "Unpaid", dot: "#C4552E" };
  return { label: "Published", dot: "#4E9A4A" };
}

/** The muted line under the member's name: "City · <the one thing worth knowing>". */
function resolveDetailLine(entry: RosterEntry, now: Date): string {
  const { member } = entry;
  let detail: string | null = null;
  if (entry.claimState === "unclaimed") detail = "not invited yet";
  else if (entry.claimState === "invited_not_signed_in") detail = "invited, not signed in";
  else if (hasStaleHours(entry, now) && member.hours_confirmed_at)
    detail = `hours confirmed ${formatShortDate(member.hours_confirmed_at)}`;
  else if (member.status === "published" && !member.dues_received_at) detail = "dues not recorded";
  else if (member.member_since_year) detail = `member since ${member.member_since_year}`;
  return detail ? `${member.city} · ${detail}` : member.city;
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word));
  return words
    .slice(0, 2)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "").charAt(0))
    .join("")
    .toUpperCase();
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

const inputClass =
  "h-[46px] rounded-[10px] border border-canvas-border bg-white px-3.5 font-sans text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const headerLabelClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted";

const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-canvas-border bg-canvas px-[13px] text-xs font-medium text-ink no-underline transition-colors hover:bg-canvas-2 disabled:opacity-60 md:h-10";

const darkButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-ink bg-ink px-[13px] text-xs font-semibold text-canvas transition-colors hover:bg-ink/85 disabled:opacity-60 md:h-10";

const menuItemClass = "min-h-10 cursor-pointer px-3 text-[13px] text-ink";

/**
 * Guild admin members roster (artboard P, GuildMembers). Search by name or
 * city, filter by member type and sign-in state -- all client-side over the
 * loaded roster. Each row keeps the artboard's two primary actions (View,
 * Edit as them), plus Invite when nobody has been invited yet; every other
 * admin action (approve/decline/suspend, Trail, dues, type correction,
 * delete) lives in the row's "More" menu.
 */
export function RosterTable({ entries }: { entries: RosterEntry[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemberType | "all">("all");
  const [claimFilter, setClaimFilter] = useState<RosterEntry["claimState"] | "all">("all");
  const router = useRouter();
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  // Member whose invite needs an email typed in (nothing on file).
  // Kept set after closing so the title doesn't blank out mid-animation.
  const [inviteTarget, setInviteTarget] = useState<RosterEntry | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  // Same "kept after closing" reasoning for the delete confirmation.
  const [deleteTarget, setDeleteTarget] = useState<RosterEntry | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fixed per mount: stale-hours is a 90-day threshold, so it can't drift meaningfully mid-session.
  const [now] = useState(() => new Date());

  async function sendInvite(entry: RosterEntry, email: string) {
    await inviteMember({ data: { memberId: entry.member.id, email } });
    await router.invalidate();
    toast.success(`Invite sent to ${email}`);
  }

  async function handleInvite(entry: RosterEntry) {
    const knownEmail = entry.ownerEmail ?? entry.member.contact_email?.trim() ?? null;
    if (!knownEmail) {
      setInviteTarget(entry);
      setInviteDialogOpen(true);
      return;
    }
    setInvitingId(entry.member.id);
    try {
      await sendInvite(entry, knownEmail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setInvitingId(null);
    }
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    try {
      await action();
      await router.invalidate();
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That action failed.");
    }
  }

  async function handleEditAsThem(entry: RosterEntry) {
    setImpersonatingId(entry.member.id);
    try {
      await startImpersonation({ data: { memberId: entry.member.id } });
      // Mark every loaded page stale before opening the editor, so nothing
      // loaded for a previously edited member can be shown for this one.
      await router.invalidate();
      await router.navigate({ to: "/admin/basics" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start editing as this member.");
      setImpersonatingId(null);
    }
  }

  const summary = useMemo(() => {
    const notSignedIn = entries.filter((entry) => entry.claimState !== "claimed").length;
    const stale = entries.filter((entry) => hasStaleHours(entry, now)).length;
    const parts = [`${entries.length} ${plural(entries.length, "member", "members")}`];
    if (notSignedIn > 0)
      parts.push(`${notSignedIn} ${plural(notSignedIn, "has", "have")} not signed in yet`);
    if (stale > 0) parts.push(`${stale} ${plural(stale, "has", "have")} stale hours`);
    return parts.join(" · ");
  }, [entries, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.member.member_type !== typeFilter) return false;
      if (claimFilter !== "all" && entry.claimState !== claimFilter) return false;
      if (!q) return true;
      return (
        entry.member.business_name.toLowerCase().includes(q) ||
        entry.member.city.toLowerCase().includes(q)
      );
    });
  }, [entries, query, typeFilter, claimFilter]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Members
          </h1>
          <p className="text-[13px] text-[#564E45]">{summary}</p>
        </div>
        <CreateMemberDialog />
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          type="search"
          aria-label="Search members"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or city"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <select
          aria-label="Filter by member type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MemberType | "all")}
          className={`${inputClass} px-3 sm:w-[200px]`}
        >
          <option value="all">All member types</option>
          <option value="producer">Producers</option>
          <option value="mobile">Mobile members</option>
          <option value="allied">Allied Members</option>
        </select>
        <select
          aria-label="Filter by sign-in state"
          value={claimFilter}
          onChange={(e) => setClaimFilter(e.target.value as RosterEntry["claimState"] | "all")}
          className={`${inputClass} px-3 sm:w-[200px]`}
        >
          <option value="all">Any sign-in state</option>
          <option value="unclaimed">Not invited yet</option>
          <option value="invited_not_signed_in">Invited, not signed in</option>
          <option value="claimed">Signed in</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-canvas-border bg-white">
        <div
          className="hidden items-center gap-4 border-b border-[#E6E0D6] bg-[#FCFAF6] px-5 py-3 md:flex"
          aria-hidden="true"
        >
          <div className="w-10 shrink-0" />
          <div className={`min-w-0 flex-1 ${headerLabelClass}`}>Member</div>
          <div className={`w-[130px] shrink-0 ${headerLabelClass}`}>Type</div>
          <div className={`w-[120px] shrink-0 ${headerLabelClass}`}>Status</div>
          <div className="w-[268px] shrink-0" />
        </div>

        <ul>
          {filtered.map((entry) => {
            const { member } = entry;
            const status = resolveRowStatus(entry, now);
            const typeLabel = MEMBER_TYPE_LABEL[member.member_type];
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#F0EBE3] px-4 py-3.5 last:border-b-0 md:flex-nowrap md:px-5"
              >
                <div
                  aria-hidden="true"
                  title={member.logo_asset_id ? undefined : "No logo yet"}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#F2EEE7] text-[11px] font-semibold tracking-[0.06em] text-ink-subtle ${
                    member.logo_asset_id
                      ? "border border-[#E6E0D6]"
                      : "border border-dashed border-[#D3CBBD]"
                  }`}
                >
                  {initialsOf(member.business_name)}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <div className="truncate text-[15px] font-semibold text-ink">
                    {member.business_name}
                  </div>
                  <div className="text-xs text-ink-muted">{resolveDetailLine(entry, now)}</div>
                  <div className="flex items-center gap-1.5 text-xs text-[#3A332C] md:hidden">
                    {typeLabel} ·
                    <span
                      className="block h-2 w-2 rounded-full"
                      style={{ background: status.dot }}
                    />
                    {status.label}
                  </div>
                </div>

                <div className="hidden w-[130px] shrink-0 text-[13px] text-[#3A332C] md:block">
                  {typeLabel}
                </div>

                <div className="hidden w-[120px] shrink-0 items-center gap-[7px] md:flex">
                  <span
                    className="block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: status.dot }}
                  />
                  <span className="text-[13px] text-[#3A332C]">{status.label}</span>
                </div>

                <div className="flex w-full flex-wrap justify-end gap-2 md:w-[268px] md:shrink-0 md:flex-nowrap">
                  {entry.claimState === "unclaimed" && (
                    <button
                      type="button"
                      onClick={() => handleInvite(entry)}
                      disabled={invitingId === member.id}
                      className={lightButtonClass}
                    >
                      {invitingId === member.id ? "Inviting…" : "Invite"}
                    </button>
                  )}
                  {member.status === "published" && (
                    <a
                      href={`/members/${member.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={lightButtonClass}
                    >
                      View
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEditAsThem(entry)}
                    disabled={impersonatingId === member.id}
                    className={darkButtonClass}
                  >
                    {impersonatingId === member.id ? "Opening…" : "Edit as them"}
                  </button>

                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`More actions for ${member.business_name}`}
                        className={`${lightButtonClass} w-11 px-0 md:w-10`}
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[220px] rounded-[10px] border-canvas-border bg-white p-1.5 font-sans shadow-lg"
                    >
                      {member.status !== "published" && (
                        <DropdownMenuItem
                          className={menuItemClass}
                          onSelect={() =>
                            runAction(
                              () => approveMember({ data: { memberId: member.id } }),
                              `Approved ${member.business_name}`,
                            )
                          }
                        >
                          Approve
                        </DropdownMenuItem>
                      )}
                      {member.status !== "declined" && (
                        <DropdownMenuItem
                          className={menuItemClass}
                          onSelect={() =>
                            runAction(
                              () => declineMember({ data: { memberId: member.id } }),
                              `Declined ${member.business_name}`,
                            )
                          }
                        >
                          Decline
                        </DropdownMenuItem>
                      )}
                      {member.status !== "suspended" && (
                        <DropdownMenuItem
                          className={menuItemClass}
                          onSelect={() =>
                            runAction(
                              () => suspendMember({ data: { memberId: member.id } }),
                              `Suspended ${member.business_name}`,
                            )
                          }
                        >
                          Suspend
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator className="bg-[#F0EBE3]" />
                      <DropdownMenuItem
                        className={menuItemClass}
                        onSelect={() =>
                          runAction(
                            () =>
                              setTrailEligible({
                                data: { memberId: member.id, eligible: !member.trail_eligible },
                              }),
                            member.trail_eligible
                              ? `Removed ${member.business_name} from the Trail`
                              : `Added ${member.business_name} to the Trail`,
                          )
                        }
                      >
                        {member.trail_eligible ? "Remove from Trail" : "Add to Trail"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={menuItemClass}
                        onSelect={() =>
                          runAction(
                            () =>
                              setDuesReceived({
                                data: {
                                  memberId: member.id,
                                  receivedAt: member.dues_received_at
                                    ? null
                                    : new Date().toISOString(),
                                },
                              }),
                            member.dues_received_at ? "Dues cleared" : "Dues marked as received",
                          )
                        }
                      >
                        {member.dues_received_at ? "Clear dues received" : "Mark dues received"}
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className={menuItemClass}>
                          Change member type
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-[180px] rounded-[10px] border-canvas-border bg-white p-1.5 font-sans">
                          <DropdownMenuRadioGroup
                            value={member.member_type}
                            onValueChange={(value) => {
                              if (value === member.member_type) return;
                              void runAction(
                                () =>
                                  correctMemberType({
                                    data: { memberId: member.id, memberType: value as MemberType },
                                  }),
                                `${member.business_name} is now ${MEMBER_TYPE_LABEL[value as MemberType]}`,
                              );
                            }}
                          >
                            {(Object.keys(MEMBER_TYPE_LABEL) as MemberType[]).map((type) => (
                              <DropdownMenuRadioItem
                                key={type}
                                value={type}
                                className="min-h-10 cursor-pointer text-[13px] text-ink"
                              >
                                {MEMBER_TYPE_LABEL[type]}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator className="bg-[#F0EBE3]" />
                      <DropdownMenuItem
                        className={`${menuItemClass} font-medium text-danger focus:bg-danger/10 focus:text-danger`}
                        onSelect={() => {
                          setDeleteTarget(entry);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        Delete member…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-ink-muted">
              {entries.length === 0
                ? "No members yet."
                : "No members match this search and filter combination."}
            </li>
          )}
        </ul>
      </div>

      <InviteEmailDialog
        businessName={inviteTarget?.member.business_name ?? ""}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSend={async (email) => {
          if (inviteTarget) await sendInvite(inviteTarget, email);
        }}
      />

      {deleteTarget && (
        <DeleteMemberDialog
          memberId={deleteTarget.member.id}
          businessName={deleteTarget.member.business_name}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      )}
    </div>
  );
}
