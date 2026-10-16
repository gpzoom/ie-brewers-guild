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
  live: "bg-[#E4F0E1] text-[#2F5E2C]",
  setting_up: "bg-[#F8EBD3] text-[#7A4E0E]",
  not_started: "bg-[#EFEAE1] text-[#5C534A]",
};

/**
 * "[Business] · [City] ▾" at the top of the portal and /admin sidebars
 * (spec 2026-10-15; artboard BZ2). Choosing a location remembers it
 * (choosePortalMember, which refuses a location the user isn't linked to)
 * and reloads the same page for that location.
 */
export function LocationSwitcher({
  data,
  tone = "light",
  afterSwitch = "same-page",
}: {
  data: LocationSwitcherData;
  /** "dark" is the trigger for the near-black setup bar. */
  tone?: "light" | "dark";
  /** "portal" lets /portal decide wizard vs sections for the chosen location. */
  afterSwitch?: "same-page" | "portal";
}) {
  const router = useRouter();
  const { pathname, search, hash } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, search: s.location.search, hash: s.location.hash }),
    structuralSharing: true,
  });
  const [busy, setBusy] = useState(false);
  const current = data.locations.find((l) => l.memberId === data.currentMemberId);

  async function choose(memberId: string) {
    if (memberId === data.currentMemberId) return;
    setBusy(true);
    try {
      await choosePortalMember({ data: { memberId } });
      await router.invalidate();
      if (afterSwitch === "portal") await router.navigate({ to: "/portal", search: {} });
      else await router.navigate({ to: pathname, search, hash });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch location.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {tone === "dark" ? (
          <button
            type="button"
            disabled={busy}
            aria-label={`Switch location. Now editing ${data.businessName} · ${current?.label ?? ""}`}
            className="flex min-h-11 min-w-0 max-w-full items-center gap-1.5 text-left font-sans text-[13px] leading-tight text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright disabled:opacity-60"
          >
            <span className="min-w-0 truncate">
              {data.businessName}
              <span className="text-text-muted"> · {current?.label}</span>
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-canvas" strokeWidth={2.4} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-label={`Switch location. Now editing ${data.businessName} · ${current?.label ?? ""}`}
            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[10px] border border-ink bg-white px-3 text-left font-sans text-[14px] font-semibold leading-tight text-ink hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-60"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {data.businessName} · {current?.label}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="flex w-[300px] max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-[12px] border-[#DED7CB] bg-white p-2 font-sans shadow-[0_14px_36px_rgba(36,31,26,0.18)]"
      >
        <DropdownMenuLabel className="px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6B6156]">
          {data.businessName} · {data.locations.length}{" "}
          {data.locations.length === 1 ? "location" : "locations"}
        </DropdownMenuLabel>
        {data.locations.map((l) => {
          const isCurrent = l.memberId === data.currentMemberId;
          return (
            <DropdownMenuItem
              key={l.memberId}
              onSelect={() => void choose(l.memberId)}
              aria-current={isCurrent ? "true" : undefined}
              className={`flex min-h-[46px] cursor-pointer items-center justify-between gap-2.5 rounded-[8px] px-2.5 text-[14px] text-ink ${isCurrent ? "bg-[#EFEAE1] font-semibold" : ""}`}
            >
              <span className="flex items-center gap-2">
                {isCurrent && (
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 6.2 5 8.6l4.5-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {l.label}
              </span>
              <span
                className={`shrink-0 rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${STATUS_CLASS[l.status]}`}
              >
                {STATUS_LABEL[l.status]}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
