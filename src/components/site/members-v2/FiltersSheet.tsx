import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { MemberType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const TYPES: Array<{ value: MemberType | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "producer", label: "Producers" },
  { value: "mobile", label: "Mobile" },
  { value: "allied", label: "Allied" },
];

/** Phone Filters panel: choices apply on "Show N members", not while tapping. */
export function FiltersSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: MemberType | undefined;
  nearest: boolean;
  countFor: (type: MemberType | undefined) => number;
  onApply: (next: { type: MemberType | undefined; nearest: boolean }) => void;
}) {
  const [type, setType] = useState(props.type);
  const [nearest, setNearest] = useState(props.nearest);
  // Start from the page's current choices every time the panel opens (it's
  // opened by the page's Filters button, which Radix doesn't report back
  // through onOpenChange).
  useEffect(() => {
    if (props.open) {
      setType(props.type);
      setNearest(props.nearest);
    }
  }, [props.open, props.type, props.nearest]);
  const n = props.countFor(type);
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          setType(props.type);
          setNearest(props.nearest);
        }
        props.onOpenChange(open);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-[18px] border-t border-border bg-[#1E1915] px-5 pb-6 pt-3 [&>button:first-child]:hidden">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between">
          <SheetTitle className="font-display text-[22px] font-extrabold uppercase">Filters</SheetTitle>
          <button type="button" aria-label="Close" onClick={() => props.onOpenChange(false)} className="flex h-10 w-10 items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Member type</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={type === t.value}
              onClick={() => setType(t.value)}
              className={cn("h-10 rounded-full border px-4 text-sm font-semibold", type === t.value ? "border-primary bg-primary/15 text-primary" : "border-border")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Sort</p>
        <div role="radiogroup" className="mt-1">
          {[
            { v: false, label: "A–Z", sub: "By business name" },
            { v: true, label: "Nearest to me", sub: "Uses your location; your browser asks first" },
          ].map((o) => (
            <button key={o.label} type="button" role="radio" aria-checked={nearest === o.v} onClick={() => setNearest(o.v)} className="flex w-full items-start gap-3 py-2.5 text-left">
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", nearest === o.v ? "border-primary" : "border-border")}>
                {nearest === o.v && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{o.label}</span>
                <span className="block text-[13px] text-muted-foreground">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => { setType(undefined); setNearest(false); }} className="px-1.5 text-[15px] font-semibold underline underline-offset-4">
            Clear
          </button>
          <button
            type="button"
            onClick={() => { props.onApply({ type, nearest }); props.onOpenChange(false); }}
            className="h-[50px] flex-1 rounded-[10px] bg-primary text-base font-bold text-primary-foreground"
          >
            Show {n} member{n === 1 ? "" : "s"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
