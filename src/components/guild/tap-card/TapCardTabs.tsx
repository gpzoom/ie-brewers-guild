export const TAP_CARD_TABS = ["cards", "offers", "milestones", "rewards"] as const;
export type TapCardTab = (typeof TAP_CARD_TABS)[number];

const LABELS: Record<TapCardTab, string> = {
  cards: "Cards",
  offers: "Offers",
  milestones: "Milestones",
  rewards: "Rewards",
};

export function isTapCardTab(value: unknown): value is TapCardTab {
  return typeof value === "string" && (TAP_CARD_TABS as readonly string[]).includes(value);
}

/** Guild > Tap Card tab strip (same look as Categories). */
export function TapCardTabs({ tab, onChange, badges }: { tab: TapCardTab; onChange: (t: TapCardTab) => void; badges?: Partial<Record<TapCardTab, number>> }) {
  return (
    <div role="tablist" aria-label="Tap Card" className="flex flex-wrap gap-2">
      {TAP_CARD_TABS.map((value) => {
        const active = value === tab;
        const badge = badges?.[value];
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(value)}
            className={`inline-flex h-11 items-center rounded-[9px] border px-[15px] text-[13px] transition-colors md:h-[42px] ${
              active ? "border-ink bg-ink font-semibold text-canvas" : "border-canvas-border bg-white text-ink hover:bg-canvas-2"
            }`}
          >
            {LABELS[value]}
            {badge ? <span className={`ml-2 text-[12px] ${active ? "text-canvas/70" : "text-ink-muted"}`}>{badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
