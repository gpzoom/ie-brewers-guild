import { useMemo, useState } from "react";
import type { RosterEntry } from "@/lib/guild/roster.server";
import type { MemberType } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateMemberDialog } from "@/components/guild/CreateMemberDialog";

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
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry) => (
            <tr key={entry.member.id} className="border-b border-border/60">
              <td className="px-3 py-3 font-medium">{entry.member.business_name}</td>
              <td className="px-3 py-3">{entry.member.city}</td>
              <td className="px-3 py-3 capitalize">{entry.member.member_type}</td>
              <td className="px-3 py-3 capitalize">{entry.member.status}</td>
              <td className="px-3 py-3">{CLAIM_STATE_LABEL[entry.claimState]}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                No members match this search and filter combination.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
