import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { submitCreatorUpload } from "@/lib/media/creator-upload.server";
import { appendMeasuredDimensions } from "@/lib/media/image-dimensions";
import {
  BrandBar,
  CanvasCard,
  CanvasHeading,
  CheckCard,
  IconTile,
  NoticeBox,
  inputClass,
  labelClass,
  leadClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/public-forms/PublicFormParts";
import { cn } from "@/lib/utils";

/**
 * No auth. No custom server.handlers.POST here -- an earlier version of
 * this route had one, wrapping a raw `fetch(...)` call from the client;
 * that shape is what broke uploads in production. A createServerFn's RPC
 * endpoint is only made reachable by the build tracing a real client-side
 * call to it -- routing the client through a route-level POST handler that
 * calls submitCreatorUpload SERVER-SIDE means nothing in the CLIENT bundle
 * ever references it, so the compiler never emits its
 * `?tss-serverfn-split` provider module and the RPC id never resolves at
 * runtime (confirmed against a real built Worker: every request 400'd with
 * "Server function info not found"). Calling submitCreatorUpload directly
 * from SendPage below -- the same pattern every other admin server-fn call
 * site in this codebase already uses (e.g. CreatorLinkPanel.tsx) -- is what
 * makes it reachable at all, and it's also what makes
 * submitCreatorUpload's own in-handler rate-limit check (see that file's
 * doc comment) the sole enforcement point: there is no route-level
 * handler left to duplicate it in, and there doesn't need to be one,
 * since the same handler body runs regardless of how the function is
 * invoked.
 */
export const Route = createFileRoute("/send/$token")({
  head: () => ({ meta: [{ title: "Share a photo — Inland Southern California Brewers Guild" }] }),
  component: SendPage,
});

/** Formats the server actually accepts (validate-file.ts: JPEG/PNG, 25MB cap). */
const ACCEPTED_TYPES = "image/png,image/jpeg";

type DeadLinkReason = "invalid" | "revoked" | "expired" | "full";

/**
 * submitCreatorUpload reports token problems as fixed, user-facing
 * messages (creator-upload.server.ts). Those mean the link itself is dead,
 * so the page swaps the form for a dead-link card rather than an inline
 * error the visitor can't fix by retrying.
 */
function deadLinkReasonFor(message: string): DeadLinkReason | null {
  if (message === "Missing token." || message === "This upload link is invalid.") return "invalid";
  if (message === "This upload link has been revoked.") return "revoked";
  if (message === "This upload link has expired.") return "expired";
  if (message === "This upload link has reached its file limit.") return "full";
  return null;
}

const DEAD_LINK_COPY: Record<DeadLinkReason, { title: string; body: string }> = {
  invalid: {
    title: "This link doesn't work",
    body: "Check you opened the whole link from the message you were sent. If it still doesn't work, ask the person who sent it for a new one.",
  },
  revoked: {
    title: "This link has been turned off",
    body: "The member who sent it has switched it off. Ask them for a new link if they'd still like your photo.",
  },
  expired: {
    title: "This link has expired",
    body: "Upload links only last a few days. Ask the member who sent it for a new one.",
  },
  full: {
    title: "This link has been used up",
    body: "It has already received as many files as it allows. Ask the member who sent it for a new link to send more.",
  },
};

/**
 * Artboard J (docs/design/artboards/CreatorUpload.dc.html): a standalone
 * page (no site header/footer -- see __root.tsx's BARE_ROUTE_PREFIXES) on
 * the dark ground, with the form on a light card.
 */
function SendPage() {
  const { token } = Route.useParams();
  const [creatorName, setCreatorName] = useState("");
  const [creditRequested, setCreditRequested] = useState(false);
  const [permissionAccepted, setPermissionAccepted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deadLink, setDeadLink] = useState<DeadLinkReason | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = (next: File | null) => {
    setFile(next);
    if (status === "error") {
      setStatus("idle");
      setErrorMessage(null);
    }
  };

  const clearFile = () => {
    chooseFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) chooseFile(dropped);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setStatus("sending");
    setErrorMessage(null);

    const formData = new FormData();
    // The route no longer has a server.handlers.POST to inject this
    // server-side (params.token) -- submitCreatorUpload is now called
    // directly, so the token has to be set on the client instead.
    formData.set("token", token);
    formData.set("creatorName", creatorName);
    formData.set("creditRequested", String(creditRequested));
    formData.set("permissionAccepted", String(permissionAccepted));
    formData.set("file", file);
    // Fallback only -- the server reads the size from the file itself
    // first (see image-dimensions.ts).
    await appendMeasuredDimensions(formData, file);

    try {
      await submitCreatorUpload({ data: formData });
      setStatus("sent");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed, please try again.";
      setStatus("error");
      setErrorMessage(message);
      setDeadLink(deadLinkReasonFor(message));
    }
  };

  const sendAnother = () => {
    clearFile();
    setPermissionAccepted(false);
    setStatus("idle");
    setErrorMessage(null);
  };

  const missing = !file
    ? "Choose a photo to send"
    : !creatorName.trim()
      ? "Add your name or handle to send"
      : !permissionAccepted
        ? "Tick the permission box to send"
        : null;

  let body;
  if (deadLink) {
    const copy = DEAD_LINK_COPY[deadLink];
    body = (
      <CanvasCard className="gap-[18px]">
        <IconTile>
          <LinkOffIcon />
        </IconTile>
        <div className="flex flex-col gap-[9px]" role="alert">
          <CanvasHeading size="md">{copy.title}</CanvasHeading>
          <p className={leadClass}>{copy.body}</p>
        </div>
      </CanvasCard>
    );
  } else if (status === "sent") {
    body = (
      <CanvasCard className="gap-[18px]">
        <IconTile>
          <CheckIcon />
        </IconTile>
        <div className="flex flex-col gap-[9px]" role="status">
          <CanvasHeading size="md">Thanks — got it.</CanvasHeading>
          <p className={leadClass}>
            The member will review it before it goes on their profile, so it may not appear right away.
          </p>
        </div>
        <button type="button" onClick={sendAnother} className={secondaryButtonClass}>
          Send another photo
        </button>
      </CanvasCard>
    );
  } else {
    body = (
      <CanvasCard className="gap-5 px-4 pb-6 pt-[22px] sm:px-10 sm:pb-10 sm:pt-10">
        <div className="flex flex-col gap-2">
          <CanvasHeading size="sm">Send a photo to a Guild member</CanvasHeading>
          <p className="text-[14px] leading-[1.55] text-ink-muted text-pretty">
            A member of the Inland Southern California Brewers Guild asked you for a photo they'd like to
            use on their Guild profile page. Send the original file — not a screenshot — and it goes
            straight to them for review.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <input
            ref={fileInputRef}
            id="creator-file"
            type="file"
            accept={ACCEPTED_TYPES}
            hidden
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />

          {file ? (
            <div className="flex items-center gap-[13px] rounded-xl border border-canvas-border bg-white py-3 pl-3.5 pr-1.5">
              <div className="h-[55px] w-11 shrink-0 overflow-hidden rounded-[7px] bg-canvas-2">
                {previewUrl && <img src={previewUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex min-w-0 grow flex-col gap-[3px]">
                <div className="truncate text-[13px] font-semibold text-ink">{file.name}</div>
                <div className="text-xs text-ink-muted">Ready to send</div>
              </div>
              <button
                type="button"
                aria-label="Remove this file"
                onClick={clearFile}
                disabled={status === "sending"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-[11px] rounded-[14px] border-2 border-dashed px-5 py-[34px] font-sans transition-colors hover:border-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                dragOver ? "border-brand bg-canvas-2" : "border-canvas-border bg-transparent",
              )}
            >
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="text-ink-muted">
                <path d="M13 19V7M7.5 12.5 13 7l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4.5 19.5v1a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="text-[15px] font-semibold text-ink">Choose a photo</span>
              <span className="text-xs text-ink-muted">JPG or PNG · up to 25 MB</span>
            </button>
          )}

          <div className="flex flex-col gap-[7px]">
            <label htmlFor="creator-name" className={labelClass}>
              Your name or handle
            </label>
            <input
              id="creator-name"
              required
              autoComplete="name"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              className={cn(inputClass, "h-12 px-[13px] text-[15px]")}
            />
          </div>

          <CheckCard
            id="creator-credit"
            checked={creditRequested}
            onChange={setCreditRequested}
            title="Credit me on the profile"
            description="Lets the member know you'd like your name shown with it."
          />

          <CheckCard
            id="creator-permission"
            tone="accent"
            checked={permissionAccepted}
            onChange={setPermissionAccepted}
            title="This is my work and they may use it"
            description="I took this photo (or have the rights to share it), and I'm giving this member permission to show it on their ISC Brewers Guild profile."
          />

          {status === "error" && errorMessage && <NoticeBox tone="danger">{errorMessage}</NoticeBox>}

          <div className="flex flex-col gap-[11px]">
            <button
              type="submit"
              disabled={!permissionAccepted || !file || !creatorName.trim() || status === "sending"}
              className={cn(primaryButtonClass, "h-[50px] text-[15px]")}
            >
              {status === "sending" ? "Sending…" : "Send it"}
            </button>
            {missing && status !== "sending" && (
              <p className="text-center text-xs text-ink-subtle">{missing}</p>
            )}
          </div>
        </form>

        <p className="border-t border-canvas-2 pt-4 text-[11px] leading-[1.55] text-ink-subtle text-pretty">
          The member reviews everything before it goes on their profile, so it may not appear right away.
          This link only lasts a few days, and you can't see anything else on their account with it.
        </p>
      </CanvasCard>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-10 font-sans">
      <div className="mx-auto w-full max-w-[520px]">
        <BrandBar />
        <div className="mx-2.5 sm:mx-0 sm:mt-6">{body}</div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-ink-muted">
      <path d="m3.2 8.4 3 3 6.6-6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-ink-muted">
      <path d="M6.6 9.4 9.4 6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7.3 4.3 8.5 3.1a2.6 2.6 0 0 1 3.7 3.7l-1.2 1.2M8.7 11.7l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="m2.5 2.5 11 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
