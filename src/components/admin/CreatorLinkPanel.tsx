import { useState } from "react";
import { createUploadToken, revokeUploadToken } from "@/lib/media/upload-tokens.server";
import type { UploadTokenRow } from "@/lib/supabase/types";
const outlineButtonClass =
  "inline-flex h-[46px] shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";
const darkButtonClass =
  "inline-flex h-[46px] shrink-0 items-center justify-center rounded-[9px] bg-ink px-[19px] text-[13px] font-semibold text-[#F9F6F0] no-underline transition-colors hover:bg-[#3A332C] hover:text-[#F9F6F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50";

function tokenStatus(token: UploadTokenRow): "active" | "expired" | "revoked" | "used up" {
  if (token.revoked_at) return "revoked";
  if (new Date(token.expires_at) < new Date()) return "expired";
  if (token.used_count >= token.max_files) return "used up";
  return "active";
}

export function CreatorLinkPanel({
  memberId,
  initialTokens,
  pendingCount = 0,
}: {
  memberId: string;
  initialTokens: UploadTokenRow[];
  /** Creator uploads awaiting approval -- links down to the ReviewTray (#review-tray). */
  pendingCount?: number;
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function onCreate() {
    setCreateError(null);
    setCreating(true);
    try {
      const { token, rawToken } = await createUploadToken({ data: { memberId } });
      setTokens((prev) => [token, ...prev]);
      setFreshLink(`${window.location.origin}/send/${rawToken}`);
      setCopied(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create a link.");
    } finally {
      setCreating(false);
    }
  }

  async function onCopy() {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions, insecure context) -- the link is in
      // a read-only field right beside this button, so it can still be
      // selected and copied by hand.
      setCopied(false);
    }
  }

  async function onRevoke(id: string) {
    setRevokeError(null);
    // Snapshot only the ONE token being revoked, not the whole `tokens`
    // array -- rolling back to a whole-array snapshot would be the same
    // stale-snapshot race already found and fixed in CarouselEditor.tsx's
    // crop-autosave (commit 0bd8398): if a second revoke (for a different
    // token) completes -- optimistically or for real -- while this one's
    // request is still in flight, restoring the pre-this-call snapshot
    // would silently revert that OTHER token's now-current state back to
    // whatever it was before this call started, with no error shown for
    // it. Capturing just this token and rolling back with a targeted,
    // functional update means only this one failed revoke is ever
    // touched, regardless of what else changed in the array meanwhile.
    const previousToken = tokens.find((t) => t.id === id);
    setTokens((prev) =>
      prev.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)),
    );
    try {
      await revokeUploadToken({ data: { id } });
    } catch (err) {
      // Roll back the optimistic flip above -- otherwise a failed revoke
      // (including an RLS-denied one) would leave this link showing
      // "revoked" in the UI while it's still actually active server-side.
      if (previousToken) {
        setTokens((prev) => prev.map((t) => (t.id === id ? previousToken : t)));
      }
      setRevokeError(err instanceof Error ? err.message : "Couldn't revoke this link.");
    }
  }

  return (
    <section
      aria-labelledby="creator-link-heading"
      className="flex flex-col gap-[11px] rounded-[13px] bg-canvas-2 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1">
        <h2
          id="creator-link-heading"
          className="font-sans text-[14px] font-semibold tracking-normal text-ink"
        >
          Didn't shoot it yourself?
        </h2>
        {pendingCount > 0 && (
          <a
            href="#review-tray"
            className="inline-flex min-h-11 items-center text-[12px] font-medium text-brand hover:text-brand-hover"
          >
            {pendingCount} waiting for review →
          </a>
        )}
      </div>
      <p className="text-[12px] leading-[1.5] text-ink-muted">
        Send the person who made it an upload link. They add the original file and their credit, it
        lands in your gallery, and nothing appears on your profile until you approve it.
      </p>

      {freshLink ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-ink">
            Copy and send this link now — it won't be shown again.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              readOnly
              aria-label="Upload link to share"
              value={freshLink}
              onFocus={(e) => e.currentTarget.select()}
              className="h-[46px] min-w-0 flex-1 rounded-[9px] border border-canvas-border bg-white px-[13px] font-mono text-[13px] text-[#3A332C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <div className="flex gap-2.5">
              <button type="button" className={`${outlineButtonClass} flex-1 sm:flex-none`} onClick={() => void onCopy()}>
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={freshLink}
                target="_blank"
                rel="noreferrer"
                className={`${darkButtonClass} flex-1 sm:flex-none`}
              >
                Preview
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`${freshLink ? outlineButtonClass : darkButtonClass} self-start`}
        disabled={creating}
        onClick={() => void onCreate()}
      >
        {creating ? "Creating…" : freshLink ? "Create another link" : "Create an upload link"}
      </button>
      <p className="text-[11px] text-ink-subtle">
        Expires in 7 days · works for up to 5 files · revoke it any time
      </p>

      {createError && (
        <p role="alert" className="text-[12px] text-danger">
          {createError}
        </p>
      )}
      {revokeError && (
        <p role="alert" className="text-[12px] text-danger">
          {revokeError}
        </p>
      )}

      {tokens.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          <h3 className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
            Your links
          </h3>
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => {
              const status = tokenStatus(token);
              return (
                <li
                  key={token.id}
                  className="flex min-h-[52px] items-center justify-between gap-3 rounded-[11px] border border-canvas-border bg-white py-1 pl-3.5 pr-1.5 text-[13px]"
                >
                  <span className="min-w-0">
                    <span className={status === "active" ? "font-medium text-ink" : "text-ink-subtle"}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <span className="text-ink-muted">
                      {" "}
                      · {token.used_count}/{token.max_files} used · expires{" "}
                      {new Date(token.expires_at).toLocaleDateString()}
                    </span>
                  </span>
                  {status === "active" && (
                    <button
                      type="button"
                      className="inline-flex h-11 shrink-0 items-center rounded-[9px] px-3 text-[13px] font-medium text-ink-muted underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      onClick={() => onRevoke(token.id)}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

