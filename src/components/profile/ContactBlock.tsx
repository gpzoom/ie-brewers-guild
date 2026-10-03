import type { ReactNode } from "react";
import type { MemberRow } from "@/lib/supabase/types";
import { PhoneIcon, mapsDirectionsUrl } from "@/components/profile/StatusBlock";

type ContactBlockProps = {
  member: MemberRow;
};

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 lg:h-[17px] lg:w-[17px]">
      <path d="M8 14.5S13 10 13 6.5a5 5 0 1 0-10 0C3 10 8 14.5 8 14.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="8" cy="6.4" r="1.9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 lg:h-[17px] lg:w-[17px]">
      <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="m2.4 4.4 5.6 4 5.6-4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 lg:h-[17px] lg:w-[17px]">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.8 8h12.4M8 1.8c3.2 3.4 3.2 9 0 12.4-3.2-3.4-3.2-9 0-12.4z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const rowClassName = "flex min-h-11 items-center gap-[11px] text-sm text-ink lg:text-[15px]";

function Row({ href, external, icon, children }: { href?: string; external?: boolean; icon: ReactNode; children: ReactNode }) {
  const content = (
    <>
      <span className="text-ink-muted">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </>
  );
  return href ? (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} className={`${rowClassName} hover:text-brand`}>
      {content}
    </a>
  ) : (
    <div className={rowClassName}>{content}</div>
  );
}

/**
 * Location field + contact, switched per type per the comparison table:
 * street address for producer/Allied Member, service area for mobile;
 * phone for producer/mobile, phone + email for Allied Member. Address
 * links out to maps, phone is tel:, email is mailto: (spec's tap-target
 * rules). Look: artboards D/E/V (stacked rows under a hairline) and L (one
 * row on desktop). Phone first, as drawn.
 */
export function ContactBlock({ member }: ContactBlockProps) {
  const isMobile = member.member_type === "mobile";
  const locationText = isMobile ? member.service_area : member.street_address;
  const hasEmail = member.member_type === "allied" && !!member.contact_email;
  const phoneSuffix = isMobile ? " · booking" : member.member_type === "allied" ? " · sales" : "";

  if (!locationText && !member.phone && !hasEmail) return null;

  return (
    <div className="flex flex-col gap-1 border-t border-canvas-2 pt-3.5 lg:flex-row lg:flex-wrap lg:gap-x-10 lg:gap-y-1 lg:pt-[18px]">
      {member.phone && (
        <Row href={`tel:${member.phone}`} icon={<PhoneIcon className="h-4 w-4 lg:h-[17px] lg:w-[17px]" />}>
          {member.phone}
          {phoneSuffix}
        </Row>
      )}
      {hasEmail && (
        <Row href={`mailto:${member.contact_email}`} icon={<MailIcon />}>
          {member.contact_email}
        </Row>
      )}
      {locationText &&
        (isMobile ? (
          <Row icon={<GlobeIcon />}>Serves {locationText}</Row>
        ) : (
          <Row href={mapsDirectionsUrl(member) ?? undefined} external icon={<PinIcon />}>
            {locationText}
          </Row>
        ))}
    </div>
  );
}
