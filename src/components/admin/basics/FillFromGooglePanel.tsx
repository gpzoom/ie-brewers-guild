import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { adminFillFromGoogle, adminSearchPlaces } from "@/lib/google/admin-fill.server";
import type { FillField } from "@/lib/google/fill-patch";
import {
  type FillSummary,
  stashFillSummary,
  takeFillSummary,
} from "@/lib/google/fill-summary-carry";
import type { PlaceCandidate } from "@/lib/google/places-client.server";
import { useDraftStatus } from "@/components/admin/DraftStatusContext";
import {
  InfoBox,
  primaryButtonClass,
  secondaryButtonClass,
  sectionLabelClass,
  textInputClass,
} from "@/components/admin/basics/ui";

export type { FillSummary };

const FIELD_LABEL: Record<FillField, string> = {
  address: "address",
  phone: "phone",
  tagline: "tagline",
  hours: "hours",
  website: "website",
};

function list(fields: FillField[]): string {
  return fields.length === 0 ? "nothing" : fields.map((f) => FIELD_LABEL[f]).join(", ");
}

/**
 * Guild admins only: finds this business on Google and fills the EMPTY
 * profile fields (address, phone, tagline, hours, website) in the draft.
 * Anything already filled in is kept. After a fill the whole page reloads so
 * every field shows the new values right away; a "working on it" box shows
 * until then, and the summary is carried across the reload.
 */
export function FillFromGooglePanel({
  memberId,
  businessName,
  city,
}: {
  memberId: string;
  businessName: string;
  city: string;
}) {
  const draftStatus = useDraftStatus();
  const [summary, setSummary] = useState<FillSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const carried = takeFillSummary(memberId);
    if (carried) setSummary(carried);
  }, [memberId]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(`${businessName} ${city}`.trim());
  const [results, setResults] = useState<PlaceCandidate[] | null>(null);
  const [busy, setBusy] = useState<"search" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy("search");
    setError(null);
    try {
      // The query already includes the city; the server adds it to the search
      // only when given, so send it empty.
      setResults(await adminSearchPlaces({ data: { memberId, query, city: "" } }));
    } catch (e) {
      setResults(null);
      setError(e instanceof Error ? e.message : "Couldn't search Google — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function choose(placeId: string) {
    setBusy(placeId);
    setError(null);
    try {
      const result = await adminFillFromGoogle({ data: { memberId, placeId } });
      const next: FillSummary = {
        filled: result.filled,
        kept: result.kept,
        permanentlyClosed: result.permanentlyClosed,
      };
      setResults(null);
      setOpen(false);
      // Nothing is saved for a permanently closed place, so nothing to reload.
      if (result.permanentlyClosed) {
        setSummary(next);
        return;
      }
      draftStatus?.reportSaved("basics", result.dirtySections);
      stashFillSummary(memberId, next);
      setRefreshing(true);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fill from Google — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-[12px] border border-canvas-border bg-white px-[17px] py-[15px]"
      aria-labelledby="fill-google-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="fill-google-heading" className={sectionLabelClass}>
          Fill from Google
        </h2>
        <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
          Guild admins only
        </span>
      </div>

      <p className="text-[13px] leading-[1.5] text-ink">
        Look this business up on Google and fill in the address, phone, tagline, hours and website
        that are still empty. Anything already filled in stays as it is.
      </p>

      {(refreshing || (busy !== null && busy !== "search")) && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-[10px] border border-[#E9C995] bg-[#FFF8EC] px-[13px] py-[11px]"
        >
          <Loader2
            aria-hidden="true"
            className="size-5 shrink-0 animate-spin text-[#C98A2E] motion-reduce:animate-none"
          />
          <p className="text-[13px] font-medium leading-[1.45] text-ink">
            {refreshing
              ? "Done. Updating the page with Google's details…"
              : "Working on it: getting this business's details from Google…"}
          </p>
        </div>
      )}

      {summary &&
        !refreshing &&
        (summary.permanentlyClosed ? (
          // The server writes nothing for a permanently closed place.
          <div role="status" className="flex flex-col gap-2">
            <InfoBox>Google lists this place as permanently closed, so nothing was filled.</InfoBox>
          </div>
        ) : (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-[13px] leading-[1.5] text-ink">
              <strong>Filled:</strong> {list(summary.filled)}. <strong>Kept yours:</strong>{" "}
              {list(summary.kept)}.
            </p>
            <p className="text-[12px] leading-[1.45] text-ink-muted">
              These are saved as unpublished changes. Review them, then publish.
            </p>
          </div>
        ))}

      {refreshing ? null : !open ? (
        <div>
          <button type="button" className={secondaryButtonClass} onClick={() => setOpen(true)}>
            Fill from Google
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <label htmlFor="fill_google_query" className="sr-only">
              Business name and city
            </label>
            <Input
              id="fill_google_query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${textInputClass} sm:flex-1`}
            />
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={busy !== null || !query.trim()}
            >
              {busy === "search" ? "Searching…" : "Search"}
            </button>
          </form>

          {results && results.length === 0 && (
            <p className="text-[13px] text-ink-muted">
              Google didn't find a match. Try a different spelling, or add the city.
            </p>
          )}
          {results && results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((place) => (
                <li
                  key={place.placeId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-canvas-border px-[13px] py-[10px]"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-ink">{place.name}</p>
                    <p className="text-[12px] text-ink-muted">{place.address}</p>
                  </div>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={busy !== null}
                    onClick={() => void choose(place.placeId)}
                  >
                    {busy === place.placeId ? "Filling…" : "That's us"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      )}

      <p className="text-[11px] text-ink-muted">Powered by Google</p>
    </section>
  );
}
