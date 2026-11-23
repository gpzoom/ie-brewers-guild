import { useState } from "react";
import { TapCardOffersSection } from "@/components/portal/TapCardOffersSection";
import { CounterPlateCard } from "@/components/portal/CounterPlateCard";
import { StaffCodesCard } from "@/components/portal/StaffCodesCard";
import { PrintKitCard } from "@/components/portal/PrintKitCard";
import { TapCardPassesCard } from "@/components/portal/TapCardPassesCard";
import { TrailOptInCard } from "@/components/portal/TrailOptInCard";

/**
 * Portal > Scan Pass and /admin/scan-pass: the brewery's counter plate,
 * staff QR codes, its Beer Trail Pass sales, and its offers. (The bar-device
 * screens for plastic passes are hidden: passes live on customers' phones.
 * The device code in brewery-tap-card.server.ts is kept for later.)
 */
export function TapCardSection({ memberId }: { memberId: string }) {
  // Joining the trail adds the Guild's offer to the Offers card, so it reloads.
  const [joins, setJoins] = useState(0);
  // Staff code changes can turn the plate on or off, and change the Print kit's list.
  const [staffVersion, setStaffVersion] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">Scan Pass</h1>
        <p className="text-pretty text-[13px] text-ink-muted">
          Customers scan your counter plate and your staff QR code with their phones to record each visit and collect
          rewards.
        </p>
      </header>

      <TrailOptInCard memberId={memberId} onJoined={() => setJoins((n) => n + 1)} />

      <PrintKitCard key={`kit-${memberId}`} memberId={memberId} staffVersion={staffVersion} />

      <CounterPlateCard key={`plate-${memberId}`} memberId={memberId} staffVersion={staffVersion} />

      <StaffCodesCard memberId={memberId} onChanged={() => setStaffVersion((n) => n + 1)} />

      <TapCardPassesCard memberId={memberId} />

      <TapCardOffersSection key={joins} memberId={memberId} />
    </div>
  );
}
