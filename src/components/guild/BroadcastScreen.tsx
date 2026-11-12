import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  continueBroadcast,
  previewBroadcastAudience,
  removeBroadcastAttachment,
  saveBroadcastDraft,
  sendBroadcastTest,
  startBroadcast,
  uploadBroadcastAttachment,
  type BroadcastAttachment,
  type BroadcastAudiencePreview,
  type BroadcastContinueResult,
  type BroadcastPage,
} from "@/lib/guild/broadcast.server";
import { audienceLabel } from "@/lib/guild/broadcast-audience";
import { BROADCAST_ATTACHMENT_LIMITS, checkAttachmentAdd } from "@/lib/guild/broadcast-attachments";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BroadcastEditor } from "@/components/guild/BroadcastEditor";
import { formatWhen } from "@/components/guild/format-when";
import {
  audienceFromForm,
  BROADCAST_FROM_LABEL,
  confirmDescription,
  confirmTitle,
  finishConfirmTitle,
  finishedTitle,
  formatAttachmentSize,
  formFromAudience,
  MEMBER_TYPE_CHOICES,
  membersText,
  peopleText,
  progressText,
  recentAudienceLine,
  searchMembers,
  sendButtonLabel,
  successTitle,
  isSendRefusal,
  LOST_CONTACT_MESSAGE,
  type AudienceMemberType,
  type AudienceTab,
} from "@/components/guild/broadcast-screen-helpers";

const sectionLabelClass = "text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6B6156]";
const cardClass =
  "flex max-w-[820px] flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6";
const fieldLabelClass = "text-[13px] font-medium text-ink";
const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 font-sans text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";
const lightButtonClass =
  "inline-flex h-12 shrink-0 items-center justify-center rounded-[10px] border border-canvas-border bg-canvas px-[18px] text-sm font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-50";
const accentButtonClass =
  "inline-flex h-12 shrink-0 items-center justify-center rounded-[10px] bg-brand px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50";
const chipClass =
  "flex min-h-[34px] max-w-full items-center gap-2 rounded-full bg-[#F2EEE7] pl-3 pr-1 text-[12px] text-[#3A332C]";
const chipRemoveClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] text-ink-subtle hover:text-ink disabled:opacity-50 md:h-7 md:w-7";

type Busy = "save" | "test" | "send" | "upload" | "remove";
/** memberCount is null after Finish sending (the screen didn't start that send). */
type SendResult = { sent: number; failed: string[]; memberCount: number | null };
/** A started broadcast to pick up where it stopped (Finish sending). */
type FinishTarget = { id: string; subject: string; processed: number; total: number };
type Progress = { done: number; total: number };

const TABS: { value: AudienceTab; label: string }[] = [
  { value: "all", label: "All members" },
  { value: "type_or_category", label: "By type or category" },
  { value: "members", label: "Pick specific members" },
];

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";
}

/**
 * The super admin's Broadcast email screen (docs/member-profiles.md,
 * "Super admin" > "Broadcast email screen"; artboard AA). Audience tabs with
 * a live count, subject, rich-text body with attachments, Save draft, Send
 * test to yourself, and Send (confirmed first), then Recent broadcasts.
 * Every action is checked again on the server; the composer's state lives
 * here, seeded once from the saved draft, so reloading the loader data
 * (after a send) never wipes what's being written.
 */
export function BroadcastScreen({ page }: { page: BroadcastPage }) {
  const router = useRouter();
  const memberNames = useMemo(
    () => new Map(page.members.map((m) => [m.id, m.business_name])),
    [page.members],
  );
  const categoryNames = useMemo(
    () => new Map(page.categories.map((c) => [c.id, c.name])),
    [page.categories],
  );

  const [initialForm] = useState(() => formFromAudience(page.draft?.audience ?? { type: "all" }));
  const [tab, setTab] = useState<AudienceTab>(initialForm.tab);
  const [memberType, setMemberType] = useState<AudienceMemberType>(initialForm.memberType);
  const [categoryId, setCategoryId] = useState(initialForm.categoryId);
  // A picked member that's no longer active can't get the email; drop it.
  const [memberIds, setMemberIds] = useState(() =>
    initialForm.memberIds.filter((id) => memberNames.has(id)),
  );
  const [search, setSearch] = useState("");

  const [subject, setSubject] = useState(page.draft?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(page.draft?.bodyHtml ?? "");
  const [initialBody, setInitialBody] = useState(page.draft?.bodyHtml ?? "");
  const [editorKey, setEditorKey] = useState(0);
  const [attachments, setAttachments] = useState<BroadcastAttachment[]>(
    page.draft?.attachments ?? [],
  );
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusyState] = useState<Busy | null>(null);
  const busyRef = useRef<Busy | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [lostContact, setLostContact] = useState(false);
  // After losing contact mid-send: the alert's Finish sending resumes this one.
  const [resumeTarget, setResumeTarget] = useState<FinishTarget | null>(null);
  // Set while the dialog is confirming Finish sending instead of a new send.
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [progress, setProgressState] = useState<Progress | null>(null);
  const progressRef = useRef<Progress | null>(null);
  const successHeadingRef = useRef<HTMLParagraphElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (result) successHeadingRef.current?.focus();
  }, [result]);

  const [preview, setPreview] = useState<BroadcastAudiencePreview | null>(null);
  const [counting, setCounting] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRequest = useRef(0);

  const audience = useMemo(
    () => audienceFromForm({ tab, memberType, categoryId, memberIds }),
    [tab, memberType, categoryId, memberIds],
  );
  const label = audienceLabel(audience, memberNames, categoryNames);
  const nothingChosen =
    (audience.type === "type_or_category" && !audience.memberType && !audience.categoryId) ||
    (audience.type === "members" && audience.memberIds.length === 0);

  // Live count: 300 ms after the last change, and only the latest answer counts.
  useEffect(() => {
    const id = ++previewRequest.current;
    if (nothingChosen) {
      setPreview({ memberCount: 0, peopleCount: 0, unsubscribedCount: 0 });
      setPreviewError(null);
      setCounting(false);
      return;
    }
    setCounting(true);
    const timer = setTimeout(() => {
      previewBroadcastAudience({ data: { audience } })
        .then((p) => {
          if (id !== previewRequest.current) return;
          setPreview(p);
          setPreviewError(null);
        })
        .catch((err) => {
          if (id !== previewRequest.current) return;
          setPreview(null);
          setPreviewError(errorText(err));
        })
        .finally(() => {
          if (id === previewRequest.current) setCounting(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [audience, nothingChosen]);

  /** One action at a time; the ref also stops a double click within one frame. */
  async function run<T>(kind: Busy, action: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    busyRef.current = kind;
    setBusyState(kind);
    try {
      return await action();
    } catch (err) {
      toast.error(errorText(err));
      return undefined;
    } finally {
      busyRef.current = null;
      setBusyState(null);
    }
  }

  const locked = result !== null;
  const messageMissing = subject.trim() === "" || bodyHtml.trim() === "";
  const peopleCount = preview?.peopleCount ?? 0;
  const message = {
    audience,
    subject,
    bodyHtml,
    attachments: attachments.map((a) => ({ path: a.path })),
  };

  function onSaveDraft() {
    void run("save", async () => {
      await saveBroadcastDraft({ data: message });
      toast.success("Draft saved.");
    });
  }

  function onSendTest() {
    void run("test", async () => {
      const { sentTo } = await sendBroadcastTest({
        data: { subject, bodyHtml, attachments: message.attachments },
      });
      toast.success(`Test sent to ${sentTo}.`);
    });
  }

  function setProgress(p: Progress | null) {
    progressRef.current = p;
    setProgressState(p);
  }

  /**
   * Sends the broadcast in batches (10 people per request: the site is on
   * the Cloudflare Workers Free plan), one continueBroadcast call after
   * another until the server says it's done. Throws on any error.
   */
  async function sendBatches(id: string, start: Progress): Promise<BroadcastContinueResult> {
    setProgress(start);
    // Each call moves at least one person on; the cap only guards a bug.
    const maxCalls = Math.ceil(Math.max(start.total - start.done, 0) / 10) + 3;
    for (let call = 0; call < maxCalls; call++) {
      const r = await continueBroadcast({ data: { id } });
      setProgress({ done: r.sentSoFar + r.failedSoFar, total: r.total });
      if (r.done) return r;
    }
    throw new Error("The send didn't finish.");
  }

  /**
   * Send now (or Finish sending): stays "busy" (so disabled) until the
   * refreshed page data is in, so Recent broadcasts shows what happened
   * before another send is possible. A start refusal is shown as is; any
   * other failure may have come after emails went out, so it gets the
   * lost-contact alert (with Finish sending once batches had started),
   * never a "try again".
   */
  async function onSendNow() {
    if (busyRef.current) return;
    busyRef.current = "send";
    setBusyState("send");
    setLostContact(false);
    setResumeTarget(null);
    const resuming = finishTarget;
    try {
      let target: FinishTarget;
      let memberCount: number | null = null;
      if (resuming) {
        target = resuming;
      } else {
        try {
          const started = await startBroadcast({ data: message });
          target = { id: started.id, subject: subject.trim(), processed: 0, total: started.total };
          memberCount = started.memberCount;
        } catch (err) {
          const text = err instanceof Error ? err.message : "";
          if (isSendRefusal(text)) toast.error(text);
          else setLostContact(true);
          setConfirmOpen(false);
          await router.invalidate().catch(() => {});
          return;
        }
      }

      let last: BroadcastContinueResult | null = null;
      try {
        last = await sendBatches(target.id, { done: target.processed, total: target.total });
      } catch (err) {
        const text = err instanceof Error ? err.message : "";
        if (isSendRefusal(text)) toast.error(text);
        const reached = progressRef.current;
        setResumeTarget({
          ...target,
          processed: reached?.done ?? target.processed,
          total: reached?.total ?? target.total,
        });
        setLostContact(true);
      }
      setConfirmOpen(false);
      setFinishTarget(null);
      if (last && last.sentSoFar === 0) {
        toast.error(
          "Nothing was sent: no address accepted the email. Your message is still here, so you can try again.",
        );
      } else if (last) {
        setResult({ sent: last.sentSoFar, failed: last.failed, memberCount });
      }
      // Recent broadcasts gets the row's new state; on success the draft is cleared too.
      await router.invalidate().catch(() => {});
    } finally {
      setProgress(null);
      busyRef.current = null;
      setBusyState(null);
    }
  }

  function onFinishSending(target: FinishTarget) {
    if (busyRef.current) return;
    setFinishTarget(target);
    setConfirmOpen(true);
  }

  function onSendAnother() {
    setResult(null);
    setTab("all");
    setMemberType("");
    setCategoryId("");
    setMemberIds([]);
    setSearch("");
    setSubject("");
    setBodyHtml("");
    setInitialBody("");
    setAttachments([]);
    setEditorKey((k) => k + 1);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const check = checkAttachmentAdd(attachments, { size: file.size, type: file.type });
    if (!check.ok) {
      toast.error(check.message);
      return;
    }
    setUploadingName(file.name);
    try {
      await run("upload", async () => {
        const form = new FormData();
        form.append("file", file);
        const added = await uploadBroadcastAttachment({ data: form });
        setAttachments((list) => [...list, added]);
      });
    } finally {
      setUploadingName(null);
    }
  }

  function onRemoveAttachment(attachment: BroadcastAttachment) {
    void run("remove", async () => {
      await removeBroadcastAttachment({ data: { path: attachment.path } });
      setAttachments((list) => list.filter((a) => a.path !== attachment.path));
    });
  }

  const matches = tab === "members" ? searchMembers(page.members, search, memberIds) : [];
  const canAddFile = attachments.length < BROADCAST_ATTACHMENT_LIMITS.maxFiles;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[700px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          Broadcast email
        </h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          One email to your members — a new program, a dues reminder, an event invite. Only you, the
          super admin, can send one, and every send is recorded in the Audit log.
        </p>
      </div>

      <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-[22px] border-0 p-0">
        <legend className="sr-only">New broadcast</legend>

        {/* TO */}
        <section aria-labelledby="broadcast-to" className={cardClass}>
          <h2 id="broadcast-to" className={sectionLabelClass}>
            To
          </h2>
          <div role="group" aria-label="Who gets this email" className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const selected = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTab(t.value)}
                  className={`inline-flex h-11 items-center rounded-[9px] border px-[15px] text-[13px] transition-colors md:h-10 ${
                    selected
                      ? "border-ink bg-ink font-semibold text-canvas"
                      : "border-canvas-border bg-white text-ink hover:bg-canvas-2"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "type_or_category" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Member type</span>
                <select
                  value={memberType}
                  onChange={(e) => setMemberType(e.target.value as AudienceMemberType)}
                  className={fieldClass}
                >
                  {MEMBER_TYPE_CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Category</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Any category</option>
                  {page.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {tab === "members" && (
            <div className="flex flex-col gap-3">
              {memberIds.length > 0 && (
                <ul aria-label="Picked members" className="flex flex-wrap gap-2">
                  {memberIds.map((id) => {
                    const name = memberNames.get(id) ?? "Member";
                    return (
                      <li key={id} className={chipClass}>
                        <span className="min-w-0 truncate">{name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() => {
                            setMemberIds((ids) => ids.filter((x) => x !== id));
                            searchRef.current?.focus();
                          }}
                          className={chipRemoveClass}
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Find a member</span>
                <input
                  ref={searchRef}
                  type="search"
                  autoComplete="off"
                  placeholder="Type a business name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <ul
                aria-label="Members to add"
                className="max-h-64 overflow-y-auto rounded-[10px] border border-canvas-border"
              >
                {matches.length === 0 ? (
                  <li className="px-3.5 py-3 text-[13px] text-ink-muted">
                    {search.trim() ? "No member matches that name." : "Everyone is already picked."}
                  </li>
                ) : (
                  matches.map((m) => (
                    <li key={m.id} className="border-b border-[#F0EBE3] last:border-b-0">
                      <button
                        type="button"
                        aria-label={`Add ${m.business_name}`}
                        onClick={() => {
                          setMemberIds((ids) => [...ids, m.id]);
                          searchRef.current?.focus();
                        }}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-[14px] text-ink hover:bg-canvas"
                      >
                        <span className="min-w-0 break-words">{m.business_name}</span>
                        <span aria-hidden="true" className="shrink-0 text-[12px] text-ink-muted">
                          + Add
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          <div
            aria-live="polite"
            className="flex items-start gap-2.5 rounded-[10px] bg-[#F2EEE7] px-3.5 py-3 text-[13px] text-[#3A332C]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            >
              <path
                d="M2 4.5 8 9l6-4.5"
                stroke="#6B6156"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <rect
                x="2"
                y="3"
                width="12"
                height="10"
                rx="1.6"
                stroke="#6B6156"
                strokeWidth="1.4"
              />
            </svg>
            <div className="min-w-0">
              {previewError ? (
                <span className="text-danger">{previewError}</span>
              ) : preview === null ? (
                "Counting…"
              ) : (
                <span className={counting ? "opacity-60" : undefined}>
                  <strong className="font-semibold text-ink">
                    {membersText(preview.memberCount)}
                  </strong>{" "}
                  ·{" "}
                  <strong className="font-semibold text-ink">
                    {peopleText(preview.peopleCount)}
                  </strong>{" "}
                  (every owner and co-owner with an email on file — business-manager editor rows
                  aren't included)
                  {preview.unsubscribedCount > 0 && ` · ${preview.unsubscribedCount} unsubscribed`}
                </span>
              )}
            </div>
          </div>

          {tab === "all" && (
            <p className="text-[12px] leading-[1.5] text-ink-subtle">
              <strong className="font-semibold text-[#6B6156]">By type or category</strong> narrows
              to Producers, Mobile members or Affiliate Members, and optionally one supply category.{" "}
              <strong className="font-semibold text-[#6B6156]">Pick specific members</strong> opens
              a search-and-add list, like addressing an email by name.
            </p>
          )}
          {nothingChosen && (
            <p className="text-[12px] leading-[1.5] text-ink-subtle">
              {tab === "members"
                ? "Add at least one member."
                : "Choose a member type, a category, or both."}
            </p>
          )}
        </section>

        {/* Subject */}
        <div className="flex max-w-[820px] flex-col gap-2">
          <label htmlFor="broadcast-subject" className={fieldLabelClass}>
            Subject
          </label>
          <input
            id="broadcast-subject"
            type="text"
            maxLength={200}
            autoComplete="off"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-[50px] w-full min-w-0 rounded-[10px] border border-canvas-border bg-white px-4 font-sans text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
          />
        </div>

        {/* Body + attachments */}
        <BroadcastEditor
          key={editorKey}
          initialHtml={initialBody}
          onChange={setBodyHtml}
          disabled={locked}
          onAttach={() => fileRef.current?.click()}
          attachDisabled={busy !== null || !canAddFile}
        >
          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#F0EBE3] px-4 py-3 md:px-[22px]">
            <input
              ref={fileRef}
              type="file"
              accept={BROADCAST_ATTACHMENT_LIMITS.mimeTypes.join(",")}
              aria-label="Attachment file"
              className="sr-only"
              tabIndex={-1}
              disabled={busy !== null || locked}
              onChange={(e) => void onFile(e)}
            />
            {attachments.map((a) => (
              <span key={a.path} className={chipClass}>
                <span className="min-w-0 break-all">
                  {a.filename} · {formatAttachmentSize(a.size_bytes)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove attachment ${a.filename}`}
                  disabled={busy !== null}
                  onClick={() => onRemoveAttachment(a)}
                  className={chipRemoveClass}
                >
                  ✕
                </button>
              </span>
            ))}
            {uploadingName && (
              <span className={`${chipClass} pr-3 text-ink-muted`} role="status">
                Uploading {uploadingName}…
              </span>
            )}
            {canAddFile && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-11 items-center rounded-full border border-dashed border-[#D3CBBD] px-[13px] text-[12px] text-[#6B6156] hover:bg-canvas disabled:opacity-50 md:h-[34px]"
              >
                {attachments.length === 0 ? "+ Attach a file" : "+ Add another file"}
              </button>
            )}
          </div>
        </BroadcastEditor>

        <p className="max-w-[820px] text-[12px] leading-[1.6] text-ink-subtle">
          From <strong className="font-semibold text-[#6B6156]">{BROADCAST_FROM_LABEL}</strong> ·
          replies go to{" "}
          <strong className="break-all font-semibold text-[#6B6156]">{page.superAdminEmail}</strong>{" "}
          · an unsubscribe link is added automatically, as required for bulk email.
        </p>

        <div className="flex max-w-[820px] flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={busy !== null}
            onClick={onSaveDraft}
            className={lightButtonClass}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={onSendTest}
            className={lightButtonClass}
          >
            {busy === "test" ? "Sending test…" : "Send test to yourself"}
          </button>
          <span aria-hidden="true" className="hidden flex-1 sm:block" />
          <button
            type="button"
            disabled={
              busy !== null ||
              counting ||
              peopleCount === 0 ||
              previewError !== null ||
              messageMissing
            }
            aria-describedby={messageMissing ? "broadcast-send-hint" : undefined}
            onClick={() => setConfirmOpen(true)}
            className={accentButtonClass}
          >
            {sendButtonLabel(peopleCount, busy === "send")}
          </button>
        </div>
        {messageMissing && !locked && (
          <p
            id="broadcast-send-hint"
            className="-mt-3 max-w-[820px] text-[12px] text-ink-subtle sm:text-right"
          >
            Add a subject and a message first.
          </p>
        )}
      </fieldset>

      {lostContact && (
        <div
          role="alert"
          className="flex max-w-[820px] items-start gap-3 rounded-[13px] border-2 border-danger bg-white px-4 py-4 md:px-[22px]"
        >
          <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
            <p className="text-[14px] font-medium text-ink">{LOST_CONTACT_MESSAGE}</p>
            {resumeTarget && resumeTarget.processed < resumeTarget.total && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => onFinishSending(resumeTarget)}
                className="inline-flex h-11 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60 md:h-10"
              >
                Finish sending
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setLostContact(false);
              setResumeTarget(null);
            }}
            className={chipRemoveClass}
          >
            ✕
          </button>
        </div>
      )}

      {result && (
        <div
          role="status"
          className="flex max-w-[820px] flex-col gap-4 rounded-[13px] border-2 border-[#4E9A4A] bg-[#F2F7F1] px-4 py-[18px] sm:flex-row sm:items-center md:px-[22px]"
        >
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div
              aria-hidden="true"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#4E9A4A]"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8.3 6.3 11.5 13 4.5"
                  stroke="#FFFFFF"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p
                ref={successHeadingRef}
                tabIndex={-1}
                className="text-[15px] font-semibold text-ink outline-none"
              >
                {result.memberCount === null
                  ? finishedTitle(result.sent)
                  : successTitle(result.sent, result.memberCount)}
              </p>
              <p className="text-[13px] text-[#3A332C]">
                Recorded in the{" "}
                <Link to="/guild/audit" className="font-medium text-[#2F5E2B] underline">
                  Audit log
                </Link>
                . Any address that couldn't be sent to is listed there.
              </p>
              {result.failed.length > 0 && (
                <p className="break-words text-[13px] text-[#3A332C]">
                  Couldn't send to: {result.failed.join(", ")}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onSendAnother}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-white px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 md:h-10"
          >
            Send another
          </button>
        </div>
      )}

      <section aria-labelledby="broadcast-recent" className="flex flex-col gap-2.5">
        <h2 id="broadcast-recent" className={sectionLabelClass}>
          Recent broadcasts
        </h2>
        <div className="overflow-hidden rounded-[14px] border border-canvas-border bg-white">
          {page.recent.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-ink-muted">No broadcasts yet.</p>
          ) : (
            <ul>
              {page.recent.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-1 border-b border-[#F0EBE3] px-4 py-3.5 last:border-b-0 md:flex-row md:items-center md:gap-4 md:px-5"
                >
                  <span className="text-[12px] text-[#6B6156] md:w-[150px] md:shrink-0">
                    {formatWhen(row.sent_at)}
                  </span>
                  <span className="min-w-0 break-words text-[14px] text-ink md:flex-1">
                    {row.subject}
                  </span>
                  <span
                    className={`text-[12px] md:w-[220px] md:shrink-0 ${row.status === "failed" || row.status === "interrupted" ? "text-danger" : "text-[#6B6156]"}`}
                  >
                    {recentAudienceLine(row)}
                  </span>
                  {row.canResume && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      aria-label={`Finish sending ${row.subject}`}
                      onClick={() =>
                        onFinishSending({
                          id: row.id,
                          subject: row.subject,
                          processed: row.processedCount,
                          total: row.totalCount,
                        })
                      }
                      className="inline-flex h-11 shrink-0 items-center justify-center self-start rounded-[9px] border border-canvas-border bg-white px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-50 md:h-10 md:self-auto"
                    >
                      Finish sending
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          // Stay open while sending, so the result can't be missed.
          if (busyRef.current === "send") return;
          setConfirmOpen(open);
          if (!open) setFinishTarget(null);
        }}
      >
        <AlertDialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[460px] sm:rounded-[14px]">
          <AlertDialogHeader className="gap-1.5 text-left">
            <AlertDialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
              {finishTarget
                ? finishConfirmTitle(Math.max(finishTarget.total - finishTarget.processed, 0))
                : confirmTitle(peopleCount)}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
              {finishTarget
                ? `“${finishTarget.subject}” picks up where it stopped: people who already got it won't get it again. This can't be undone.`
                : confirmDescription(label)}
            </AlertDialogDescription>
            {busy === "send" && (
              <div className="flex flex-col gap-2 pt-1">
                <p role="status" className="text-[13px] font-medium text-ink">
                  This can take a minute or two. Keep this page open.
                  {progress && (
                    <span className="mt-1 block font-normal text-[#3A332C]">
                      {progressText(progress.done, progress.total)}
                    </span>
                  )}
                </p>
                {progress && (
                  <div
                    role="progressbar"
                    aria-label="Sending progress"
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={progress.done}
                    className="h-2 w-full overflow-hidden rounded-full bg-[#F2EEE7]"
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-300"
                      style={{
                        width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              disabled={busy === "send"}
              onClick={() => {
                setConfirmOpen(false);
                setFinishTarget(null);
              }}
              className="inline-flex h-11 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onSendNow()}
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {busy === "send" ? "Sending…" : finishTarget ? "Finish sending" : "Send now"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
