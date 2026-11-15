import { Link } from "@tanstack/react-router";
import {
  CanvasCard,
  CanvasHeading,
  cardLinkClass,
  leadClass,
} from "@/components/public-forms/PublicFormParts";

/**
 * A declined applicant who signs in (Join the Guild spec, "Roster and
 * approval"): shown on /portal and /join/finish instead of anything
 * editable. "Switch business" only for someone linked to other businesses.
 */
export function InactiveApplicationCard({ canSwitchBusiness = false }: { canSwitchBusiness?: boolean }) {
  return (
    <CanvasCard>
      <div className="flex flex-col gap-[9px]" role="status">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">Join the Guild</p>
        <CanvasHeading>Application not active</CanvasHeading>
        <p className={leadClass}>
          Your application isn't active. Please{" "}
          <Link to="/contact" className={cardLinkClass}>
            contact us
          </Link>
          .
        </p>
      </div>
      {canSwitchBusiness && (
        <p className="text-[13px] leading-[1.55] text-ink-muted text-pretty">
          Working on another business?{" "}
          <Link to="/portal" search={{ switch: true }} className={cardLinkClass}>
            Switch business
          </Link>
        </p>
      )}
    </CanvasCard>
  );
}
