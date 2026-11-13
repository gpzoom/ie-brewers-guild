import { useState, type FormEvent } from "react";
import type { EmploymentType, JobPostingRow } from "@/lib/supabase/types";
import { createJob, deleteJob, markJobFilled, repostJob, updateJob } from "@/lib/jobs/jobs.server";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  JOB_LIMITS,
  JOB_LISTING_DAYS,
  jobState,
  shortDate,
  validateJobInput,
  type JobInput,
  type JobState,
} from "@/lib/jobs/jobs";
import {
  Field,
  primaryButtonClass,
  secondaryButtonClass,
  sectionLabelClass,
  textInputClass,
} from "@/components/admin/basics/ui";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Jobs (artboard CC1; docs/member-profiles.md, "Jobs board" > "Posting a
 * job"). Every member type, every linked role. Not drafted: posting,
 * editing, Mark filled, Repost and Delete are live the moment they save --
 * the same as the Food calendar.
 */

const EMPTY: JobInput = {
  title: "",
  employmentType: "full_time",
  locationText: "",
  description: "",
  howToApply: "",
};

const STATE_PILL: Record<JobState, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-[#E4F0E1] text-[#2F5E2C]" },
  filled: { label: "Filled", className: "bg-[#F2EEE7] text-ink-muted" },
  expired: { label: "Expired", className: "bg-[#F2EEE7] text-ink-muted" },
};

const smallButtonClass = cn(secondaryButtonClass, "h-9 px-[14px] text-[12px]");

function toInput(job: JobPostingRow): JobInput {
  return {
    title: job.title,
    employmentType: job.employment_type,
    locationText: job.location_text ?? "",
    description: job.description,
    howToApply: job.how_to_apply,
  };
}

function metaLine(job: JobPostingRow, state: JobState): string {
  const type = EMPLOYMENT_TYPE_LABELS[job.employment_type];
  const posted = `Posted ${shortDate(job.posted_at)}`;
  if (state === "open") return `${type} · ${posted} · Active until ${shortDate(job.expires_at)}`;
  if (state === "expired") return `${type} · ${posted} · Expired ${shortDate(job.expires_at)}`;
  return `${type} · ${posted} · Filled`;
}

function sortNewest(jobs: JobPostingRow[]): JobPostingRow[] {
  return [...jobs].sort((a, b) => b.posted_at.localeCompare(a.posted_at));
}

export function JobsEditor({
  memberId,
  initialJobs,
}: {
  memberId: string;
  initialJobs: JobPostingRow[];
}) {
  const [jobs, setJobs] = useState(() => sortNewest(initialJobs));
  const [form, setForm] = useState<JobInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<JobPostingRow | null>(null);
  const now = new Date();

  function replace(row: JobPostingRow) {
    setJobs((list) => sortNewest(list.map((job) => (job.id === row.id ? row : job))));
  }

  function set<K extends keyof JobInput>(key: K, value: JobInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFormNote(null);
  }

  function startEdit(job: JobPostingRow) {
    setEditingId(job.id);
    setForm(toInput(job));
    setFormError(null);
    setFormNote(null);
    document.getElementById("job-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setFormError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateJobInput(form);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        replace(await updateJob({ data: { id: editingId, ...result.value } }));
        setFormNote("Saved. The change is on the jobs board now.");
      } else {
        const row = await createJob({ data: { memberId, ...result.value } });
        setJobs((list) => sortNewest([row, ...list]));
        setFormNote("Posted. It's on the jobs board now.");
      }
      setEditingId(null);
      setForm(EMPTY);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function rowAction(job: JobPostingRow, action: "filled" | "repost") {
    setBusyId(job.id);
    setRowError(null);
    try {
      replace(
        action === "filled"
          ? await markJobFilled({ data: { id: job.id } })
          : await repostJob({ data: { id: job.id } }),
      );
      if (editingId === job.id) cancelEdit();
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Couldn't save — try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(job: JobPostingRow) {
    setBusyId(job.id);
    setRowError(null);
    try {
      await deleteJob({ data: { id: job.id } });
      setJobs((list) => list.filter((row) => row.id !== job.id));
      if (editingId === job.id) cancelEdit();
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Couldn't delete — try again.");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-[26px]">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[28px]">
          Jobs
        </h1>
        <p className="text-pretty text-[13px] text-ink-muted">
          Post an opening on the Guild{" "}
          <a
            href="/jobs"
            target="_blank"
            rel="noreferrer"
            className="text-brand underline underline-offset-2 hover:text-brand-hover"
          >
            jobs board
          </a>
          . It goes live as soon as you save it — no need to Publish changes, and no Guild admin
          review.
        </p>
      </header>

      {jobs.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-labelledby="your-postings">
          <h2 id="your-postings" className={sectionLabelClass}>
            Your postings
          </h2>
          <ul className="overflow-hidden rounded-[14px] border border-[#DED7CB] bg-white">
            {jobs.map((job) => {
              const state = jobState(job, now);
              const pill = STATE_PILL[state];
              const busy = busyId === job.id;
              const muted = state !== "open";
              return (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#F0EBE3] px-5 py-4 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 basis-[220px] flex-col gap-[3px]">
                    <span
                      className={cn(
                        "text-[14px] font-semibold",
                        muted ? "text-ink-subtle" : "text-ink",
                      )}
                    >
                      {job.title}
                    </span>
                    <span
                      className={cn("text-[12px]", muted ? "text-ink-subtle" : "text-ink-muted")}
                    >
                      {metaLine(job, state)}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-[11px] py-1 text-[11px] font-semibold",
                      pill.className,
                    )}
                  >
                    {pill.label}
                  </span>
                  {state === "open" ? (
                    <>
                      <button
                        type="button"
                        className={smallButtonClass}
                        disabled={busy}
                        onClick={() => startEdit(job)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={smallButtonClass}
                        disabled={busy}
                        onClick={() => rowAction(job, "filled")}
                      >
                        Mark filled
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={smallButtonClass}
                        disabled={busy}
                        onClick={() => rowAction(job, "repost")}
                      >
                        Repost
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete the posting "${job.title}"`}
                        disabled={busy}
                        onClick={() => setConfirmDelete(job)}
                        className="flex h-9 w-9 items-center justify-center rounded-[8px] text-ink-subtle hover:bg-canvas-2 hover:text-ink disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {rowError && (
            <p role="alert" className="text-[12px] font-medium text-danger">
              {rowError}
            </p>
          )}
        </section>
      )}

      <form
        id="job-form"
        onSubmit={submit}
        noValidate
        className="flex max-w-[760px] scroll-mt-6 flex-col gap-4 rounded-[14px] border border-[#DED7CB] bg-white p-5 md:p-6"
      >
        <h2 className={sectionLabelClass}>{editingId ? "Edit job" : "Post a job"}</h2>

        <Field id="job-title" label="Job title">
          <Input
            id="job-title"
            value={form.title}
            maxLength={JOB_LIMITS.title}
            placeholder="e.g. Taproom Lead, Weekends"
            onChange={(e) => set("title", e.target.value)}
            className={textInputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="job-type" label="Employment type">
            <select
              id="job-type"
              value={form.employmentType}
              onChange={(e) => set("employmentType", e.target.value as EmploymentType)}
              className={cn(textInputClass, "border px-3")}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EMPLOYMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="job-location" label="Location">
            <Input
              id="job-location"
              value={form.locationText}
              maxLength={JOB_LIMITS.location}
              placeholder="City, or Remote"
              onChange={(e) => set("locationText", e.target.value)}
              className={textInputClass}
            />
          </Field>
        </div>

        <Field id="job-description" label="Description">
          <textarea
            id="job-description"
            rows={5}
            value={form.description}
            maxLength={JOB_LIMITS.description}
            placeholder="What the role involves, hours, and anything a candidate should know before applying."
            onChange={(e) => set("description", e.target.value)}
            className="resize-y rounded-[10px] border border-canvas-border bg-white px-[14px] py-[13px] text-[15px] leading-[1.5] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:rounded-[9px] md:text-[14px]"
          />
        </Field>

        <Field
          id="job-apply"
          label="How to apply"
          hint={
            'Shown as a button on the listing. An email address becomes "Apply by email"; a link becomes "Apply →".'
          }
        >
          <Input
            id="job-apply"
            value={form.howToApply}
            maxLength={JOB_LIMITS.howToApply}
            placeholder="An email address, or a link to your own application form"
            onChange={(e) => set("howToApply", e.target.value)}
            className={textInputClass}
          />
        </Field>

        {formError && (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {formError}
          </p>
        )}
        {formNote && (
          <p role="status" className="text-[13px] text-ink-muted">
            {formNote}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1.5">
          <p className="text-[12px] text-ink-subtle">
            Stays listed for {JOB_LISTING_DAYS} days, or until you mark it filled — whichever comes
            first.
          </p>
          <div className="flex gap-2.5">
            {editingId && (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className={cn(primaryButtonClass, "h-[46px] px-[22px] text-[14px]")}
              disabled={saving}
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Post job"}
            </button>
          </div>
        </div>
        {editingId && (
          <button
            type="button"
            className="self-start text-[13px] font-medium text-danger underline underline-offset-2"
            onClick={() => {
              const job = jobs.find((row) => row.id === editingId);
              if (job) setConfirmDelete(job);
            }}
          >
            Delete this posting
          </button>
        )}
      </form>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent className="rounded-[18px] border-0 bg-canvas p-[30px] sm:rounded-[18px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
              Delete this posting?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
              "{confirmDelete?.title}" will be removed for good. To take an open job down but keep
              it for later, use Mark filled instead — you can Repost it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-[46px] rounded-[9px] border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink hover:bg-canvas-2">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => confirmDelete && remove(confirmDelete)}
              className="h-[46px] rounded-[9px] px-[19px] text-[14px] font-semibold"
            >
              Delete posting
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 5h9M6.5 5V3.5h3V5M6 7.5v3.5M10 7.5v3.5M4.5 5l.6 7.3c.05.65.6 1.2 1.25 1.2h3.3c.65 0 1.2-.55 1.25-1.2L11.5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
