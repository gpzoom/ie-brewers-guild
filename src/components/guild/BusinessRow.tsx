import type { BusinessManagementMode } from "@/lib/supabase/types";
import type { RosterBusiness } from "@/lib/guild/roster-groups";

// h-11 on phones keeps the 44px touch target; h-10 from md up (same as the roster's buttons).
const segmentClass = (active: boolean) =>
  `inline-flex h-11 items-center px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 md:h-10 ${
    active ? "bg-ink text-canvas" : "bg-white text-ink hover:bg-canvas-2"
  }`;

/**
 * A multi-location business's header row on the roster (artboard BZ1): its
 * name and location count, Managed by, and -- one-manager with no manager
 * yet -- the business's single Invite. Its locations render under it.
 */
export function BusinessRow(props: {
  business: RosterBusiness;
  locationCount: number;
  busy: boolean;
  onModeChange: (mode: BusinessManagementMode) => void;
  onInvite: () => void;
}) {
  const { business } = props;
  const oneManager = business.mode === "one_manager";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#E6E0D6] bg-[#FCFAF6] px-4 py-3.5 md:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="truncate text-[15px] font-semibold text-ink">
          {business.name}{" "}
          <span className="font-normal text-ink-muted">
            · {props.locationCount} {props.locationCount === 1 ? "location" : "locations"}
          </span>
        </div>
        {oneManager && (
          <div className="text-xs text-ink-muted">
            {business.managerEmail
              ? `Manager: ${business.managerEmail}${business.managerSignedIn ? "" : " · invited, not signed in"}`
              : "no manager yet"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Managed by
        </span>
        <div
          role="group"
          aria-label="Managed by"
          className="inline-flex overflow-hidden rounded-lg border border-canvas-border"
        >
          <button
            type="button"
            aria-pressed={oneManager}
            disabled={props.busy}
            onClick={() => !oneManager && props.onModeChange("one_manager")}
            className={segmentClass(oneManager)}
          >
            One manager
          </button>
          <button
            type="button"
            aria-pressed={!oneManager}
            disabled={props.busy}
            onClick={() => oneManager && props.onModeChange("separate")}
            className={`${segmentClass(!oneManager)} border-l border-canvas-border`}
          >
            Each location separately
          </button>
        </div>
        {oneManager && !business.managerEmail && (
          <button
            type="button"
            onClick={props.onInvite}
            disabled={props.busy}
            className="inline-flex h-11 items-center rounded-lg border border-canvas-border bg-canvas px-[13px] text-xs font-medium text-ink hover:bg-canvas-2 disabled:opacity-60 md:h-10"
          >
            Invite
          </button>
        )}
      </div>
    </div>
  );
}
