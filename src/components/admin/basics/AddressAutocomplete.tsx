import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapPin, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SUGGEST_DEBOUNCE_MS,
  createAddressLookup,
  type AddressLookup,
  type AddressSuggestion,
  type PickedPlace,
  type PlacesLibraryLike,
} from "@/lib/geo/places-address";

/**
 * The street-address input with Google address suggestions (Places API
 * (New), programmatic -- the dropdown is ours, styled like the rest of
 * Basics & hours). Typing works exactly like a plain input; suggestions are
 * an extra. If the key is missing or Google refuses (API not enabled,
 * referrer not allowed, billing off), it stays a plain input and logs once.
 *
 * Same browser key and loader as the public members map (MembersMap.tsx):
 * VITE_GOOGLE_MAPS_API_KEY through @vis.gl/react-google-maps' APIProvider,
 * which loads the Maps JavaScript API; useMapsLibrary("places") is
 * google.maps.importLibrary("places") underneath.
 */

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let warned = false;
function warnOnce(error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    "Address suggestions are off (Google Places didn't respond); the address field still works as plain text.",
    error,
  );
}

type Props = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onBlur: (value: string) => void;
  onPick: (picked: PickedPlace) => void;
  className?: string;
};

export function AddressAutocompleteInput(props: Props) {
  if (!MAPS_API_KEY) return <AddressCombobox {...props} lookup={null} />;
  return (
    <APIProvider apiKey={MAPS_API_KEY} onError={warnOnce}>
      <WithPlaces {...props} />
    </APIProvider>
  );
}

function WithPlaces(props: Props) {
  const places = useMapsLibrary("places");
  const lookup = useMemo(
    () => (places ? createAddressLookup(places as unknown as PlacesLibraryLike) : null),
    [places],
  );
  return <AddressCombobox {...props} lookup={lookup} />;
}

function AddressCombobox({
  id,
  value,
  onValueChange,
  onBlur,
  onPick,
  className,
  lookup,
}: Props & { lookup: AddressLookup | null }) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Only the newest request may fill the list (responses can arrive out of order).
  const requestSeq = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const enabled = lookup !== null && !failed;
  const showList = enabled && open && suggestions.length > 0;

  function close() {
    clearTimeout(timer.current);
    requestSeq.current++;
    setOpen(false);
    setActive(-1);
  }

  function requestSuggestions(text: string) {
    clearTimeout(timer.current);
    if (!enabled || !lookup) return;
    const seq = ++requestSeq.current;
    timer.current = setTimeout(() => {
      lookup
        .suggest(text)
        .then((list) => {
          if (seq !== requestSeq.current) return;
          setSuggestions(list);
          setActive(-1);
          setOpen(list.length > 0);
        })
        .catch((error: unknown) => {
          warnOnce(error);
          setFailed(true);
          setOpen(false);
        });
    }, SUGGEST_DEBOUNCE_MS);
  }

  function choose(index: number) {
    const suggestion = suggestions[index];
    close();
    if (!suggestion || !lookup) return;
    lookup
      .pick(suggestion.id)
      .then((picked) => {
        if (picked) onPick(picked);
      })
      .catch((error: unknown) => {
        // The typed text stays; the member can keep typing by hand.
        warnOnce(error);
      });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!enabled || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" && showList) {
      event.preventDefault();
      close();
    }
  }

  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        role={enabled ? "combobox" : undefined}
        aria-autocomplete={enabled ? "list" : undefined}
        aria-expanded={enabled ? showList : undefined}
        aria-controls={enabled ? listId : undefined}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value);
          requestSuggestions(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          close();
          onBlur(e.target.value);
        }}
      />
      {showList && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[12px] border border-canvas-border bg-white shadow-[0_8px_24px_rgba(36,31,26,0.12)]">
          <ul
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            className="m-0 list-none p-1"
          >
            {suggestions.map((s, i) => {
              const Icon = s.isBusiness ? Store : MapPin;
              return (
                <li
                  key={s.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  // Keep focus in the input so choosing doesn't blur-save the typed text.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex min-h-[46px] cursor-pointer items-center gap-[10px] rounded-[8px] px-[11px] py-[7px] text-ink",
                    i === active && "bg-canvas-2",
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-medium">{s.mainText}</span>
                    {s.secondaryText && (
                      <span className="truncate text-[12px] text-ink-muted">{s.secondaryText}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* Google's required attribution for Places results shown without a
              Google map: the text "Google Maps", untranslated and unmodified
              (Google Maps Platform attribution guidelines). */}
          <div
            translate="no"
            className="flex justify-end border-t border-canvas-2 px-[12px] py-[6px] text-[11px] font-medium text-ink-muted"
          >
            Google Maps
          </div>
        </div>
      )}
    </div>
  );
}
