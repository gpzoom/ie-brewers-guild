import { describe, expect, it } from "vitest";
import {
  applyAction,
  filterJobs,
  jobLocation,
  jobState,
  memberInitials,
  postedAgo,
  validateJobInput,
  type PublicJob,
} from "@/lib/jobs/jobs";

const NOW = new Date("2026-11-12T18:00:00Z");

function job(over: Partial<PublicJob> = {}, member: Partial<PublicJob["member"]> = {}): PublicJob {
  return {
    id: "j1",
    title: "Taproom Lead, Weekends",
    employmentType: "part_time",
    locationText: null,
    description: "Pour beer.",
    howToApply: "jobs@example.com",
    postedAt: "2026-11-09T18:00:00Z",
    expiresAt: "2027-01-08T18:00:00Z",
    member: {
      name: "All Points Brewing Co.",
      slug: "all-points",
      city: "Riverside",
      state: "CA",
      isAffiliate: false,
      tileColor: "#FFFFFF",
      markColor: "#9B2242",
      ...member,
    },
    ...over,
  };
}

describe("applyAction", () => {
  it("turns an email address into Apply by email", () => {
    expect(applyAction(" jobs@example.com ")).toEqual({
      kind: "email",
      href: "mailto:jobs@example.com",
      label: "Apply by email",
    });
    expect(applyAction("mailto:jobs@example.com")?.href).toBe("mailto:jobs@example.com");
  });

  it("turns a link into Apply →, adding https to a bare www", () => {
    expect(applyAction("https://example.com/apply")).toMatchObject({
      kind: "url",
      label: "Apply →",
    });
    expect(applyAction("www.example.com/jobs")?.href).toBe("https://www.example.com/jobs");
  });

  it("never links anything else", () => {
    expect(applyAction("javascript:alert(1)")).toBeNull();
    expect(applyAction("call us")).toBeNull();
    expect(applyAction("https://localhost")).toBeNull();
    expect(applyAction("")).toBeNull();
  });
});

describe("validateJobInput", () => {
  const base = {
    title: " Assistant Brewer ",
    employmentType: "full_time" as const,
    locationText: " Riverside, CA ",
    description: " Brew. ",
    howToApply: "https://example.com/apply",
  };

  it("trims and accepts a complete posting", () => {
    const result = validateJobInput(base);
    expect(result).toEqual({
      ok: true,
      value: {
        ...base,
        title: "Assistant Brewer",
        locationText: "Riverside, CA",
        description: "Brew.",
      },
    });
  });

  it("asks for each missing field", () => {
    expect(validateJobInput({ ...base, title: " " })).toEqual({
      ok: false,
      error: "Add a job title.",
    });
    expect(validateJobInput({ ...base, description: "" })).toEqual({
      ok: false,
      error: "Add a description.",
    });
    expect(validateJobInput({ ...base, howToApply: "" }).ok).toBe(false);
  });

  it("refuses an apply value that's neither email nor link, and an unknown type", () => {
    expect(validateJobInput({ ...base, howToApply: "ask at the bar" }).ok).toBe(false);
    expect(validateJobInput({ ...base, employmentType: "gig" as never }).ok).toBe(false);
  });

  it("allows an empty location", () => {
    expect(validateJobInput({ ...base, locationText: "" }).ok).toBe(true);
  });
});

describe("jobState", () => {
  it("is open until expires_at, expired after, and filled whenever filled", () => {
    expect(jobState({ status: "open", expires_at: "2026-11-13T00:00:00Z" }, NOW)).toBe("open");
    expect(jobState({ status: "open", expires_at: "2026-11-12T17:00:00Z" }, NOW)).toBe("expired");
    expect(jobState({ status: "filled", expires_at: "2026-11-12T17:00:00Z" }, NOW)).toBe("filled");
  });
});

describe("postedAgo", () => {
  it("reads in days, then weeks", () => {
    expect(postedAgo("2026-11-12T10:00:00Z", NOW)).toBe("Posted today");
    expect(postedAgo("2026-11-11T10:00:00Z", NOW)).toBe("Posted yesterday");
    expect(postedAgo("2026-11-09T18:00:00Z", NOW)).toBe("Posted 3 days ago");
    expect(postedAgo("2026-10-22T18:00:00Z", NOW)).toBe("Posted 3 weeks ago");
  });
});

describe("memberInitials", () => {
  it("takes two initials, skipping Co. and similar", () => {
    expect(memberInitials("All Points Brewing Co.")).toBe("AP");
    expect(memberInitials("Hangar24")).toBe("HAN");
    expect(memberInitials("The Brew Co")).toBe("TB");
    expect(memberInitials("")).toBe("?");
  });
});

describe("filterJobs", () => {
  const jobs = [
    job({ id: "a", title: "Assistant Brewer", employmentType: "full_time" }),
    job({ id: "b", title: "Delivery Driver", employmentType: "seasonal" }, { name: "Hangar 24" }),
  ];

  it("filters by type pill and by title or member name", () => {
    expect(filterJobs(jobs, "", null).map((j) => j.id)).toEqual(["a", "b"]);
    expect(filterJobs(jobs, "", "seasonal").map((j) => j.id)).toEqual(["b"]);
    expect(filterJobs(jobs, "brewer", null).map((j) => j.id)).toEqual(["a"]);
    expect(filterJobs(jobs, "hangar", null).map((j) => j.id)).toEqual(["b"]);
    expect(filterJobs(jobs, "hangar", "full_time")).toEqual([]);
  });
});

describe("jobLocation", () => {
  it("uses the posting's own location, else the member's city", () => {
    expect(jobLocation(job({ locationText: "Remote" }))).toBe("Remote");
    expect(jobLocation(job())).toBe("Riverside, CA");
    expect(jobLocation(job({}, { city: null, state: null }))).toBeNull();
  });
});
