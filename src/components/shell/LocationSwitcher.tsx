import { useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { choosePortalMember } from "@/lib/portal/portal-session.server";
import type { LocationStatus, LocationSwitcherData } from "@/lib/portal/location-groups";

export const STATUS_LABEL: Record<LocationStatus, string> = {
  live: "Live",
  setting_up: "Setting up",
  not_started: "Not started",
};

const STATUS_CLASS: Record<LocationStatus, string> = {
  live: "bg-[#E4F1E2] text-[#2F6B2C]",
  setting_up: "bg-[#F6EADF] text-[#7A4413]",
  not_started: "bg-canvas-2 text-ink-muted",
};

/**
 * "[Business] · [City] ▾" at the top of the portal and /admin sidebars
 * (spec 2026-10-15; artboard BZ2). Choosing a location remembers it
 * (choosePortalMember, which refuses a location the user isn't linked to)
 * and reloads the same page for that location.
 */
export function LocationSwitcher({ data }: { data: LocationSwitcherData }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [busy, setBusy] = useState(false);
  const current = data.locations.find((l) => l.memberId === data.currentMemberId);

  async function choose(memberId: string) {
    if (memberId === data.currentMemberId) return;
    setBusy(true);
    try {
      await choosePortalMember({ data: { memberId } });
      await router.invalidate();
      await router.navigate({ to: pathname });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch location.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={`Switch location. Now editing ${data.businessName} · ${current?.city ?? ""}`}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[9px] border border-canvas-border bg-white px-3 text-left font-display text-[15px] font-bold leading-tight text-ink hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-60"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {data.businessName} <span className="font-sans font-normal text-ink-muted">· {current?.city}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px] rounded-[10px] border-canvas-border bg-white p-1.5 font-sans shadow-lg">
        <DropdownMenuLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Locations
        </DropdownMenuLabel>
        {data.locations.map((l) => (
          <DropdownMenuItem
            key={l.memberId}
            onSelect={() => void choose(l.memberId)}
            aria-current={l.memberId === data.currentMemberId ? "true" : undefined}
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-[14px] text-ink"
          >
            <span className={l.memberId === data.currentMemberId ? "font-semibold" : undefined}>{l.city}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[l.status]}`}>
              {STATUS_LABEL[l.status]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
