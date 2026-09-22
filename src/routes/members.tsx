import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHero } from "@/components/site/PageHero";
import { SectionHeader } from "@/components/site/SectionHeader";
import { MembersMap } from "@/components/site/MembersMap";
import { members, type Location } from "@/data/site";
import { slugify } from "@/lib/slug";
import { validateDirectorySearch } from "@/lib/directory/search-params";
import { Beer, ExternalLink, Facebook, Instagram, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import heroImg from "@/assets/pillar-events.jpg";

export const Route = createFileRoute("/members")({
  validateSearch: validateDirectorySearch,
  head: () => ({
    meta: [
      { title: "Member Directory — IE Brewers Guild" },
      { name: "description", content: "Discover the independent producers, mobile members, and Allied Members that make up the IE Brewers Guild." },
      { property: "og:title", content: "Member Directory" },
      { property: "og:description", content: "The independent producers, mobile members, and Allied Members behind the guild." },
    ],
  }),
  component: MembersPage,
});

// Untappd icon (lucide doesn't ship one)
function UntappdIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M11.165 11.13 6.073 18.2a2.42 2.42 0 0 1-1.7 1l-.62.08a.6.6 0 0 0-.43.27l-.32.48a.3.3 0 0 1-.45.06l-.71-.51a.3.3 0 0 1-.07-.45l.32-.48a.6.6 0 0 0 .1-.5l-.16-.6a2.42 2.42 0 0 1 .39-1.95l5.09-7.07a3.7 3.7 0 0 0 .67-2.49l-.13-1.55a1.5 1.5 0 0 1 .55-1.3l1-.78a.4.4 0 0 1 .57.08l.27.36a.4.4 0 0 0 .58.07l.36-.27a.4.4 0 0 1 .57.08l.78 1a1.5 1.5 0 0 1 .27 1.39l-.5 1.47a3.7 3.7 0 0 0 .39 2.55Zm10.83 5.61-5.09-7.07a3.7 3.7 0 0 1-.67-2.49l.13-1.55a1.5 1.5 0 0 0-.55-1.3l-1-.78a.4.4 0 0 0-.57.08l-.27.36a.4.4 0 0 1-.58.07l-.36-.27a.4.4 0 0 0-.57.08l-.78 1a1.5 1.5 0 0 0-.27 1.39l.5 1.47a3.7 3.7 0 0 1-.39 2.55l-.45.62 3.34 4.64 2.13 2.96a2.42 2.42 0 0 0 1.7 1l.62.08a.6.6 0 0 1 .43.27l.32.48a.3.3 0 0 0 .45.06l.71-.51a.3.3 0 0 0 .07-.45l-.32-.48a.6.6 0 0 1-.1-.5l.16-.6a2.42 2.42 0 0 0-.39-1.95Z" />
    </svg>
  );
}

type SelectedLocation = {
  brewery: string;
  website: string;
  location: Location;
};

function MembersPage() {
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/members" });

  const initialView =
    search.mapLat !== undefined && search.mapLng !== undefined && search.mapZoom !== undefined
      ? { lat: search.mapLat, lng: search.mapLng, zoom: search.mapZoom }
      : undefined;

  return (
    <>
      <PageHero
        image={heroImg}
        eyebrow="Our members"
        title="The independent producers, mobile members, and Allied Members behind the guild."
        subtitle="Every member is independently owned and proud of it."
        minHeight="min-h-[50vh]"
      />

      <section className="mx-auto max-w-7xl px-4 pt-20 md:px-6">
        <SectionHeader
          eyebrow="Find a member"
          title="Members on the map."
          subtitle="Click any pin for the address, website, and driving directions."
          align="center"
        />
        <div className="mt-10">
          <MembersMap
            members={members}
            linkSearch={search}
            initialView={initialView}
            onViewChange={(view) =>
              navigate({
                search: (prev) => ({ ...prev, mapLat: view.lat, mapLng: view.lng, mapZoom: view.zoom }),
                replace: true,
              })
            }
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <article
              key={m.name}
              className="group relative flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/60"
            >
              {/* Social icons stacked vertically */}
              <div className="absolute right-4 top-4 flex flex-col gap-2">
                {m.facebook && (
                  <a
                    href={m.facebook}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${m.name} on Facebook`}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Facebook className="h-4 w-4" />
                  </a>
                )}
                {m.instagram && (
                  <a
                    href={m.instagram}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${m.name} on Instagram`}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Instagram className="h-4 w-4" />
                  </a>
                )}
                {m.untappd && (
                  <a
                    href={m.untappd}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${m.name} on Untappd`}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <UntappdIcon className="h-4 w-4" />
                  </a>
                )}
              </div>

              {/* Logo */}
              <div className="flex h-24 w-24 items-center justify-center rounded-md bg-background/60 p-2">
                {m.logo ? (
                  <img
                    src={m.logo}
                    alt={`${m.name} logo`}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Beer className="h-10 w-10 text-primary" />
                )}
              </div>

              <h3 className="mt-4 text-xl text-foreground">{m.name}</h3>

              {/* Clickable location chips — each opens the address modal */}
              <p className="mt-1 inline-flex flex-wrap items-start gap-x-1 gap-y-0.5 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {m.locations.map((loc, i) => (
                  <span key={`${loc.city}-${i}`} className="text-primary">
                    <button
                      type="button"
                      onClick={() =>
                        setSelected({ brewery: m.name, website: m.website, location: loc })
                      }
                      className="rounded underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {loc.city}
                    </button>
                    {i < m.locations.length - 1 && <span className="text-muted-foreground">, </span>}
                  </span>
                ))}
              </p>

              <Link
                to="/members/$slug"
                params={{ slug: slugify(m.name) }}
                search={search}
                className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold uppercase tracking-wider text-primary hover:underline"
              >
                View profile
              </Link>

              <a
                href={m.website}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold uppercase tracking-wider text-foreground hover:text-primary"
              >
                Visit <ExternalLink className="h-4 w-4" />
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* Address modal — shared across all cards */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selected.brewery}</DialogTitle>
                <DialogDescription className="text-primary">{selected.location.city}</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-foreground/85">{selected.location.address}</p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button asChild variant="outline">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.location.lat},${selected.location.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation className="h-4 w-4" /> Directions
                  </a>
                </Button>
                <Button asChild>
                  <a href={selected.website} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Visit website
                  </a>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
