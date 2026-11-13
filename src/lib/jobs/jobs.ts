import type { EmploymentType, JobPostingRow } from "@/lib/supabase/types";

/**
 * Jobs board (docs/member-profiles.md, "Jobs board"; artboards CC1, CC2).
 * Pure helpers shared by the member's Jobs screen and the public /jobs page.
 */

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  "full_time",
  "part_time",
  "seasonal",
  "internship",
  "contract",
];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  seasonal: "Seasonal",
  internship: "Internship",
  contract: "Contract",
};

/** The public page's filter pills (Contract postings show under All types only). */
export const JOB_FILTER_TYPES: readonly EmploymentType[] = [
  "full_time",
  "part_time",
  "seasonal",
  "internship",
];

export function isEmploymentType(value: unknown): value is EmploymentType {
  return typeof value === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

/** How long a posting stays listed; the database sets the real dates. */
export const JOB_LISTING_DAYS = 60;

export const JOB_LIMITS = {
  title: 120,
  location: 120,
  description: 5000,
  howToApply: 500,
} as const;

const EMAIL_PATTERN = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

export type ApplyAction = { kind: "email" | "url"; href: string; label: string };

/**
 * The Apply button: "Apply by email" for an email address (mailto:), "Apply →"
 * for a link. A bare "www.example.com" gets https://. Null when it's neither,
 * so nothing unsafe (javascript: and friends) ever becomes a link.
 */
export function applyAction(howToApply: string): ApplyAction | null {
  const value = howToApply.trim().replace(/^mailto:/i, "");
  if (EMAIL_PATTERN.test(value)) {
    return { kind: "email", href: `mailto:${value}`, label: "Apply by email" };
  }
  const withScheme = /^https?:\/\//i.test(value)
    ? value
    : /^www\./i.test(value)
      ? `https://${value}`
      : null;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return { kind: "url", href: url.toString(), label: "Apply →" };
  } catch {
    return null;
  }
}

export type JobInput = {
  title: string;
  employmentType: EmploymentType;
  locationText: string;
  description: string;
  howToApply: string;
};

/** The cleaned fields, or the first problem in words the member can act on. */
export function validateJobInput(
  input: JobInput,
): { ok: true; value: JobInput } | { ok: false; error: string } {
  const value: JobInput = {
    title: input.title.trim(),
    employmentType: input.employmentType,
    locationText: input.locationText.trim(),
    description: input.description.trim(),
    howToApply: input.howToApply.trim(),
  };
  if (!value.title) return { ok: false, error: "Add a job title." };
  if (value.title.length > JOB_LIMITS.title) {
    return { ok: false, error: `Keep the job title under ${JOB_LIMITS.title} characters.` };
  }
  if (!isEmploymentType(value.employmentType)) {
    return { ok: false, error: "Choose an employment type." };
  }
  if (value.locationText.length > JOB_LIMITS.location) {
    return { ok: false, error: `Keep the location under ${JOB_LIMITS.location} characters.` };
  }
  if (!value.description) return { ok: false, error: "Add a description." };
  if (value.description.length > JOB_LIMITS.description) {
    return { ok: false, error: `Keep the description under ${JOB_LIMITS.description} characters.` };
  }
  if (!value.howToApply)
    return { ok: false, error: "Add how to apply: an email address or a link." };
  if (value.howToApply.length > JOB_LIMITS.howToApply || !applyAction(value.howToApply)) {
    return {
      ok: false,
      error: "How to apply needs an email address (name@example.com) or a link (https://…).",
    };
  }
  return { ok: true, value };
}

export type JobState = "open" | "filled" | "expired";

/** Filled wins over expired: a filled posting says Filled whenever it ran out. */
export function jobState(job: Pick<JobPostingRow, "status" | "expires_at">, now: Date): JobState {
  if (job.status === "filled") return "filled";
  return new Date(job.expires_at).getTime() > now.getTime() ? "open" : "expired";
}

/** "Sep 21" -- the member's own list (artboard CC1). */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Posted today", "Posted yesterday", "Posted 3 days ago", "Posted 2 weeks ago"... */
export function postedAgo(postedAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(postedAt).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 14) return `Posted ${days} days ago`;
  return `Posted ${Math.floor(days / 7)} weeks ago`;
}

/** Up to three letters for the member's mark ("All Points Brewing Co." -> "AP"). */
export function memberInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean)
    .filter((word, i) => i === 0 || !/^(co|inc|llc|the|and|of)$/i.test(word));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

/** A posting on the public board, with the member who posted it. */
export type PublicJob = {
  id: string;
  title: string;
  employmentType: EmploymentType;
  locationText: string | null;
  description: string;
  howToApply: string;
  postedAt: string;
  expiresAt: string;
  member: {
    name: string;
    slug: string;
    city: string | null;
    state: string | null;
    isAffiliate: boolean;
    tileColor: string;
    markColor: string;
  };
};

/** Search (title or member name) and the type pill; `type` null is All types. */
export function filterJobs(
  jobs: readonly PublicJob[],
  query: string,
  type: EmploymentType | null,
): PublicJob[] {
  const needle = query.trim().toLowerCase();
  return jobs.filter(
    (job) =>
      (type === null || job.employmentType === type) &&
      (!needle ||
        job.title.toLowerCase().includes(needle) ||
        job.member.name.toLowerCase().includes(needle)),
  );
}

/** The row's location: the posting's own, else the member's city. */
export function jobLocation(job: PublicJob): string | null {
  if (job.locationText?.trim()) return job.locationText.trim();
  const { city, state } = job.member;
  return [city, state].filter(Boolean).join(", ") || null;
}
