import type { MemberRow } from "@/lib/supabase/types";
import { Mail, MapPin, Phone } from "lucide-react";

type ContactBlockProps = {
  member: MemberRow;
};

/**
 * Location field + contact, switched per type per the comparison table:
 * street address for producer/Allied Member, service area for mobile;
 * phone for producer/mobile, phone + email for Allied Member. Address
 * links out to maps, phone is tel:, email is mailto: (spec's tap-target
 * rules).
 */
export function ContactBlock({ member }: ContactBlockProps) {
  const locationText =
    member.member_type === "mobile" ? member.service_area : member.street_address;
  const mapsQuery = member.street_address ? `${member.street_address}, ${member.city}, ${member.state}` : null;

  return (
    <div className="flex flex-col gap-2 text-sm text-ink">
      {locationText && (
        <a
          href={mapsQuery ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}` : undefined}
          target={mapsQuery ? "_blank" : undefined}
          rel={mapsQuery ? "noreferrer" : undefined}
          className="inline-flex min-h-11 items-center gap-2"
        >
          <MapPin className="h-4 w-4 shrink-0 text-brand-bright" /> {locationText}
        </a>
      )}
      {member.phone && (
        <a href={`tel:${member.phone}`} className="inline-flex min-h-11 items-center gap-2">
          <Phone className="h-4 w-4 shrink-0 text-brand-bright" /> {member.phone}
        </a>
      )}
      {member.member_type === "allied" && member.contact_email && (
        <a href={`mailto:${member.contact_email}`} className="inline-flex min-h-11 items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-brand-bright" /> {member.contact_email}
        </a>
      )}
    </div>
  );
}
