import type { PortalRole } from "@/lib/portal/portal-destination";
import type { ChooserEntry } from "@/lib/portal/location-groups";

const ROLE_LABELS: Record<PortalRole, string> = {
  owner: "Owner",
  editor: "Full editor",
  media_events: "Photos & events editor",
};

/**
 * The buttons on "Choose a business": a one-manager business appears once
 * (with its location count); every other membership appears by its label.
 */
export function ChooseList({
  entries,
  busyId,
  onChoose,
}: {
  entries: ChooserEntry[];
  busyId: string | null;
  onChoose: (memberId: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((entry) => {
        const target = entry.kind === "business" ? entry.openMemberId : entry.memberId;
        const key = entry.kind === "business" ? `b-${entry.businessId}` : `m-${entry.memberId}`;
        const second =
          entry.kind === "business" ? `${entry.locationCount} locations` : ROLE_LABELS[entry.role];
        const busy = busyId === target;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onChoose(target)}
              disabled={busyId !== null}
              className="flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-[13px] border border-canvas-border bg-white px-[15px] py-3 text-left transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-[15px] font-semibold text-ink">{entry.label}</span>
              <span className="text-[13px] text-ink-muted">{busy ? "Opening…" : second}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
