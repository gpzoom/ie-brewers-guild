import { TapCardOffersSection } from "@/components/portal/TapCardOffersSection";
import { CounterPlateCard } from "@/components/portal/CounterPlateCard";
import { TapCardPassesCard } from "@/components/portal/TapCardPassesCard";

/**
 * Portal > Scan Pass and /admin/scan-pass: the brewery's counter plate and
 * staff QR code, its Beer Trail Pass sales, and its offers. (The bar-device
 * screens for plastic passes are hidden: passes live on customers' phones.
 * The device code in brewery-tap-card.server.ts is kept for later.)
 */
export function TapCardSection({ memberId }: { memberId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">Scan Pass</h1>
        <p className="text-pretty text-[13px] text-ink-muted">
          Customers scan your counter plate and your staff QR code with their phones to record each visit and collect
          rewards.
        </p>
      </header>

      <CounterPlateCard memberId={memberId} />

      <TapCardPassesCard memberId={memberId} />

      <TapCardOffersSection memberId={memberId} />
    </div>
  );
}
