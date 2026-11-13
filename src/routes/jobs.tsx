import { useId, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { EmploymentType } from "@/lib/supabase/types";
import { listPublicJobs } from "@/lib/jobs/jobs.server";
import {
  applyAction,
  EMPLOYMENT_TYPE_LABELS,
  filterJobs,
  JOB_FILTER_TYPES,
  jobLocation,
  memberInitials,
  postedAgo,
  shortDate,
  type PublicJob,
} from "@/lib/jobs/jobs";
import { cn } from "@/lib/utils";

/**
 * The Jobs board (docs/member-profiles.md, "Jobs board" > "The public page";
 * artboard CC2). One flat list, newest first; a search box and type pills;
 * a row expands in place to show the description and the Apply button --
 * there's no separate detail page. Postings that are filled or past their
 * 60 days drop off on their own (RLS and listPublicJobs).
 */
export const Route = createFileRoute("/jobs")({
  // Always fresh: a posting goes live the moment a member saves it.
  staleTime: 0,
  loader: () => listPublicJobs(),
  head: () => ({
    meta: [
      { title: "Jobs — Inland Southern California Brewers Guild" },
      {
        name: "description",
        content:
          "Open roles at Inland Southern California Brewers Guild members — breweries, mobile vendors and the businesses that supply them.",
      },
      { property: "og:title", content: "Jobs — Inland Southern California Brewers Guild" },
      {
        property: "og:description",
        content: "Open roles across the Guild, posted by our members.",
      },
    ],
  }),
  component: JobsPage,
});

const PAGE_SIZE = 20;

function JobsPage() {
  const jobs = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EmploymentType | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => filterJobs(jobs, query, type), [jobs, query, type]);
  const visible = filtered.slice(0, shown);
  const filtering = query.trim() !== "" || type !== null;

  return (
    <div className="bg-background text-foreground">
      <section className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 pb-2 pt-10 md:px-12 md:pt-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Jobs</p>
        <h1 className="max-w-[760px] font-display text-[30px] font-extrabold leading-[1.1] md:text-[36px]">
          Open roles across the Guild.
        </h1>
        <p className="max-w-[760px] text-[15px] leading-[1.55] text-muted-foreground">
          Posted directly by our members — producers, mobile vendors and the businesses that supply
          them. Apply straight to the member; the Guild isn't involved in hiring.
        </p>
      </section>

      <div className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pb-[18px] pt-[26px] md:flex-row md:flex-wrap md:items-center md:gap-2.5 md:px-12">
          <label className="flex h-[46px] w-full items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-primary md:max-w-[360px] md:flex-1">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="sr-only">Search roles or members</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE_SIZE);
              }}
              placeholder="Search roles or members…"
              className="h-full w-full min-w-0 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
          <div role="group" aria-label="Employment type" className="flex flex-wrap gap-2">
            <TypePill active={type === null} onClick={() => setType(null)}>
              All types
            </TypePill>
            {JOB_FILTER_TYPES.map((t) => (
              <TypePill
                key={t}
                active={type === t}
                onClick={() => {
                  setType(t);
                  setShown(PAGE_SIZE);
                }}
              >
                {EMPLOYMENT_TYPE_LABELS[t]}
              </TypePill>
            ))}
          </div>
          <span className="hidden flex-1 md:block" />
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {filtered.length} open {filtered.length === 1 ? "role" : "roles"}
          </p>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="mx-auto max-w-7xl px-4 py-16 text-[15px] text-muted-foreground md:px-12">
          No open roles right now. Check back soon, or see our{" "}
          <Link to="/members" className="text-primary underline underline-offset-4">
            members
          </Link>{" "}
          directly.
        </p>
      ) : filtered.length === 0 ? (
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-16 md:px-12">
          <p className="text-[15px] text-muted-foreground">
            No roles match{filtering ? " that search" : ""}.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setType(null);
            }}
            className="text-[14px] font-semibold text-primary underline underline-offset-4"
          >
            Show all roles
          </button>
        </div>
      ) : (
        <>
          <ul>
            {visible.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                now={now}
                open={openId === job.id}
                onToggle={() => setOpenId((id) => (id === job.id ? null : job.id))}
              />
            ))}
          </ul>
          {filtered.length > shown && (
            <div className="flex justify-center px-4 pb-14 pt-[30px]">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="h-[46px] rounded-[9px] border border-border px-5 text-[13px] font-semibold text-foreground/85 hover:border-primary hover:text-primary"
              >
                Show more roles
              </button>
            </div>
          )}
        </>
      )}
      <div className="h-14" />
    </div>
  );
}

function TypePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-10 items-center rounded-full border px-[15px] text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-foreground/85 hover:border-primary/60",
      )}
    >
      {children}
    </button>
  );
}

function JobRow({
  job,
  now,
  open,
  onToggle,
}: {
  job: PublicJob;
  now: Date;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const apply = applyAction(job.howToApply);
  const location = jobLocation(job);
  const memberLine = [
    job.member.isAffiliate ? `${job.member.name} (Affiliate Member)` : job.member.name,
    location,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={cn("border-b border-border/70", open && "bg-card/60")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-[22px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:gap-5 md:px-12"
      >
        <span
          aria-hidden="true"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[9px] font-display text-[12px] font-extrabold"
          style={{ backgroundColor: job.member.tileColor, color: job.member.markColor }}
        >
          {memberInitials(job.member.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[16px] font-bold leading-snug text-foreground">{job.title}</span>
          <span className="text-[13px] text-muted-foreground">{memberLine}</span>
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground md:hidden">
            <TypeTag type={job.employmentType} />
            {postedAgo(job.postedAt, now)}
          </span>
        </span>
        <span className="hidden w-[110px] shrink-0 justify-center md:flex">
          <TypeTag type={job.employmentType} />
        </span>
        <span className="hidden w-[130px] shrink-0 text-[13px] text-muted-foreground md:block">
          {postedAgo(job.postedAt, now)}
        </span>
        {open ? (
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-foreground/70" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-foreground/40" />
        )}
      </button>
      {open && (
        <div id={panelId} className="mx-auto max-w-7xl px-4 pb-7 md:px-12">
          <div className="flex max-w-[760px] flex-col gap-4 md:pl-[62px]">
            <p className="whitespace-pre-line text-[14px] leading-[1.65] text-foreground/85">
              {job.description}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {apply ? (
                <a
                  href={apply.href}
                  {...(apply.kind === "url"
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="inline-flex h-11 items-center rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
                >
                  {apply.label}
                </a>
              ) : (
                <span className="text-[14px] text-foreground/85">To apply: {job.howToApply}</span>
              )}
              <span className="text-[12px] text-muted-foreground">
                Open until filled, or {shortDate(job.expiresAt)} — whichever comes first
              </span>
            </div>
            <Link
              to="/members/$slug"
              params={{ slug: job.member.slug }}
              className="w-fit text-[13px] text-primary underline underline-offset-4"
            >
              About {job.member.name}
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

function TypeTag({ type }: { type: EmploymentType }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full border border-border px-3 text-[12px] font-semibold text-foreground/85">
      {EMPLOYMENT_TYPE_LABELS[type]}
    </span>
  );
}
