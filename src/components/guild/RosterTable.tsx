import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { RosterEntry } from "@/lib/guild/roster.server";
import type { MemberType } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CreateMemberDialog } from "@/components/guild/CreateMemberDialog";
import { DeleteMemberDialog } from "@/components/guild/DeleteMemberDialog";
import { InviteEmailDialog } from "@/components/guild/InviteEmailDialog";
import { inviteMember } from "@/lib/guild/invite-member.server";
import { startImpersonation } from "@/lib/guild/impersonation.server";
import {
  approveMember,
  declineMember,
  suspendMember,
  setTrailEligible,
  correctMemberType,
  setDuesReceived,
} from "@/lib/guild/member-admin-actions.server";

const CLAIM_STATE_LABEL: Record<RosterEntry["claimState"], string> = {
  unclaimed: "Unclaimed",
  invited_not_signed_in: "Invited — not signed in",
  claimed: "Claimed",
};

/**
 * Search by business name/city, filter by member_type/status/claim state
 * (task brief, "Search/filter by this state and by member_type/status").
 * Row-level actions (invite, approve/decline, suspend, correct type, toggle
 * trail_eligible, Edit as them) are added by Tasks 15-18, each extending
 * this same table -- this task only builds the list, search, and filters.
 */
export function RosterTable({ entries }: { entries: RosterEntry[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemberType | "all">("all");
  const [claimFilter, setClaimFilter] = useState<RosterEntry["claimState"] | "all">("all");
  const router = useRouter();
  const [invitingId, setInvitingId] = useState<string | null>(null);
  // Member whose invite needs an email typed in (nothing on file).
  // Kept set after closing so the title doesn't blank out mid-animation.
  const [inviteTarget, setInviteTarget] = useState<RosterEntry | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

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

  async function runAction(action: () => Promise<unknown>) {
    try {
      await action();
      await router.invalidate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "That action failed.");
    }
  }

  async function handleEditAsThem(entry: RosterEntry) {
    await startImpersonation({ data: { memberId: entry.member.id } });
    await router.navigate({ to: "/admin/basics" });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.member.member_type !== typeFilter) return false;
      if (claimFilter !== "all" && entry.claimState !== claimFilter) return false;
      if (!q) return true;
      return (
        entry.member.business_name.toLowerCase().includes(q) || entry.member.city.toLowerCase().includes(q)
      );
    });
  }, [entries, query, typeFilter, claimFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="roster-search">Search</Label>
            <Input
              id="roster-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Business name or city"
              className="mt-1 h-11 w-56"
            />
          </div>
          <div>
            <Label htmlFor="roster-type-filter">Member type</Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as MemberType | "all")}>
              <SelectTrigger id="roster-type-filter" className="mt-1 h-11 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="producer">Producer</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="allied">Allied Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="roster-claim-filter">Roster state</Label>
            <Select
              value={claimFilter}
              onValueChange={(value) => setClaimFilter(value as RosterEntry["claimState"] | "all")}
            >
              <SelectTrigger id="roster-claim-filter" className="mt-1 h-11 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="unclaimed">Unclaimed</SelectItem>
                <SelectItem value="invited_not_signed_in">Invited — not signed in</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CreateMemberDialog />
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-2">Business</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Roster state</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry) => (
            <tr key={entry.member.id} className="border-b border-border/60">
              <td className="px-3 py-3 font-medium">{entry.member.business_name}</td>
              <td className="px-3 py-3">{entry.member.city}</td>
              <td className="px-3 py-3">
                <label className="sr-only" htmlFor={`member-type-${entry.member.id}`}>
                  Member type for {entry.member.business_name}
                </label>
                <select
                  id={`member-type-${entry.member.id}`}
                  value={entry.member.member_type}
                  onChange={(e) =>
                    runAction(() => correctMemberType({ data: { memberId: entry.member.id, memberType: e.target.value as MemberType } }))
                  }
                  className="min-h-11 rounded-md border border-border bg-background px-2 text-sm capitalize"
                >
                  <option value="producer">Producer</option>
                  <option value="mobile">Mobile</option>
                  <option value="allied">Allied Member</option>
                </select>
              </td>
              <td className="px-3 py-3 capitalize">{entry.member.status}</td>
              <td className="px-3 py-3">{CLAIM_STATE_LABEL[entry.claimState]}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {entry.claimState === "unclaimed" && (
                    <button
                      type="button"
                      onClick={() => handleInvite(entry)}
                      disabled={invitingId === entry.member.id}
                      className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
                    >
                      {invitingId === entry.member.id ? "Inviting…" : "Invite"}
                    </button>
                  )}
                  {entry.member.status !== "published" && (
                    <button
                      type="button"
                      onClick={() => runAction(() => approveMember({ data: { memberId: entry.member.id } }))}
                      className="min-h-11 rounded-md border border-open/50 px-3 py-1 text-sm font-medium text-open hover:bg-open/10"
                    >
                      Approve
                    </button>
                  )}
                  {entry.member.status !== "declined" && (
                    <button
                      type="button"
                      onClick={() => runAction(() => declineMember({ data: { memberId: entry.member.id } }))}
                      className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
                    >
                      Decline
                    </button>
                  )}
                  {entry.member.status !== "suspended" && (
                    <button
                      type="button"
                      onClick={() => runAction(() => suspendMember({ data: { memberId: entry.member.id } }))}
                      className="min-h-11 rounded-md border border-danger/50 px-3 py-1 text-sm font-medium text-danger hover:bg-danger/10"
                    >
                      Suspend
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => runAction(() => setTrailEligible({ data: { memberId: entry.member.id, eligible: !entry.member.trail_eligible } }))}
                    className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
                  >
                    {entry.member.trail_eligible ? "Remove from Trail" : "Add to Trail"}
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(() => setDuesReceived({ data: { memberId: entry.member.id, receivedAt: entry.member.dues_received_at ? null : new Date().toISOString() } }))}
                    className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
                  >
                    {entry.member.dues_received_at ? "Clear dues received" : "Mark dues received"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditAsThem(entry)}
                    className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
                  >
                    Edit as them
                  </button>
                  <span className="ml-2 border-l border-border pl-3">
                    <DeleteMemberDialog memberId={entry.member.id} businessName={entry.member.business_name} />
                  </span>
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                No members match this search and filter combination.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <InviteEmailDialog
        businessName={inviteTarget?.member.business_name ?? ""}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSend={async (email) => {
          if (inviteTarget) await sendInvite(inviteTarget, email);
        }}
      />
    </div>
  );
}
