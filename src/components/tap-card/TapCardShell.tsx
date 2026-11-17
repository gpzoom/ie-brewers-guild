import type { ReactNode } from "react";
import { BrandBar, CanvasCard } from "@/components/public-forms/PublicFormParts";

/** The narrow public card layout every Tap Card screen uses (same as the visit-link page). */
export function TapCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg pb-10 font-sans">
      <div className="mx-auto w-full max-w-[480px]">
        <BrandBar linkHome />
        <div className="mx-2.5 sm:mx-0 sm:mt-6">
          <CanvasCard className="gap-[18px]">{children}</CanvasCard>
        </div>
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{children}</span>;
}
