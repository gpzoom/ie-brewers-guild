/**
 * One-time geocoding script.
 *
 * For every brewery × city pair in src/data/site.ts, query the
 * Places API (New) Text Search endpoint and capture the address + lat/lng.
 *
 * Run:
 *   node --env-file=.env scripts/geocode-members.ts
 *
 * Output: scripts/geocoded-members.json (gitignored — review before merging
 * into src/data/site.ts).
 */
import { members } from "../src/data/site.ts";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error(
    "Missing GOOGLE_PLACES_API_KEY. Copy .env.example to .env and fill it in.",
  );
  process.exit(1);
}

type PlacesResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    websiteUri?: string;
  }>;
};

type GeocodedLocation = {
  brewery: string;
  city: string;
  query: string;
  placeId?: string;
  displayName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  websiteUri?: string;
  needsReview?: string;
};

// Cities/labels that won't geocode to a real taproom — flag for manual review.
const REVIEW_HINTS: Array<{ match: RegExp; reason: string }> = [
  { match: /airport/i, reason: "non-taproom location (airport)" },
  { match: /^orange county$/i, reason: "vague locality — needs a specific city" },
];

async function searchPlace(query: string): Promise<PlacesResponse> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY!,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!res.ok) {
    throw new Error(`Places API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PlacesResponse;
}

function reviewReason(city: string): string | undefined {
  return REVIEW_HINTS.find((h) => h.match.test(city))?.reason;
}

const results: GeocodedLocation[] = [];

for (const member of members) {
  for (const city of member.locations) {
    const query = `${member.name} ${city}`;
    process.stdout.write(`  ${query} ... `);
    try {
      const data = await searchPlace(query);
      const place = data.places?.[0];
      const extraReason = reviewReason(city);
      if (!place) {
        console.log("no result");
        results.push({
          brewery: member.name,
          city,
          query,
          needsReview: "no place result",
        });
        continue;
      }
      console.log(place.formattedAddress ?? "(no address)");
      results.push({
        brewery: member.name,
        city,
        query,
        placeId: place.id,
        displayName: place.displayName?.text,
        address: place.formattedAddress,
        lat: place.location?.latitude,
        lng: place.location?.longitude,
        websiteUri: place.websiteUri,
        ...(extraReason ? { needsReview: extraReason } : {}),
      });
    } catch (err) {
      console.log("error");
      console.error(err);
      results.push({
        brewery: member.name,
        city,
        query,
        needsReview: `error: ${(err as Error).message}`,
      });
    }
    // gentle pacing — well below Places API rate limits
    await new Promise((r) => setTimeout(r, 150));
  }
}

const outputPath = resolve(import.meta.dirname, "geocoded-members.json");
writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.log(`\nWrote ${results.length} entries to ${outputPath}`);

const flagged = results.filter((r) => r.needsReview);
if (flagged.length > 0) {
  console.log(`\n${flagged.length} entries need manual review:`);
  for (const f of flagged) {
    console.log(`  - ${f.brewery} / ${f.city}: ${f.needsReview}`);
  }
}
