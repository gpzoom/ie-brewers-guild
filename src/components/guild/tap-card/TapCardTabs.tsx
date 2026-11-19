export const TAP_CARD_TABS = ["cards", "offers", "templates", "milestones", "rewards", "passes"] as const;
export type TapCardTab = (typeof TAP_CARD_TABS)[number];

const LABELS: Record<TapCardTab, string> = {
  cards: "Cards",
  offers: "Offers",
  templates: "Templates",
  milestones: "Milestones",
  rewards: "Rewards",
  passes: "Passes",
};

export function isTapCardTab(value: unknown): value is TapCardTab {
  return typeof value === "string" && (TAP_CARD_TABS as readonly string[]).includes(value);
}

/**
 * Guild > Tap Card tab strip (same look as Categories). A tab in `alerts`
 * gets the red pulsing border the member portal's alert banner uses (Offers,
 * while loyalty offers wait for approval).
 */
export function TapCardTabs({
  tab,
  onChange,
  badges,
  alerts,
}: {
  tab: TapCardTab;
  onChange: (t: TapCardTab) => void;
  badges?: Partial<Record<TapCardTab, number>>;
  alerts?: Partial<Record<TapCardTab, boolean>>;
}) {
  return (
    <div role="tablist" aria-label="Tap Card" className="flex flex-wrap gap-2">
      {TAP_CARD_TABS.map((value) => {
        const active = value === tab;
        const badge = badges?.[value];
        const alert = alerts?.[value] === true;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(value)}
            className={`inline-flex h-11 items-center rounded-[9px] px-[15px] text-[13px] transition-colors md:h-[42px] ${
              active ? "bg-ink font-semibold text-canvas" : "bg-white text-ink hover:bg-canvas-2"
            } ${alert ? "notification-pulse border-2 border-[#B42318]" : active ? "border border-ink" : "border border-canvas-border"}`}
          >
            {LABELS[value]}
            {badge ? <span className={`ml-2 text-[12px] ${active ? "text-canvas/70" : "text-ink-muted"}`}>{badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
