import { useState } from "react";
import { createUploadToken, revokeUploadToken } from "@/lib/media/upload-tokens.server";
import type { UploadTokenRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";

function tokenStatus(token: UploadTokenRow): "active" | "expired" | "revoked" | "used up" {
  if (token.revoked_at) return "revoked";
  if (new Date(token.expires_at) < new Date()) return "expired";
  if (token.used_count >= token.max_files) return "used up";
  return "active";
}

export function CreatorLinkPanel({
  memberId,
  initialTokens,
}: {
  memberId: string;
  initialTokens: UploadTokenRow[];
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function onCreate() {
    setCreateError(null);
    try {
      const { token, rawToken } = await createUploadToken({ data: { memberId } });
      setTokens((prev) => [token, ...prev]);
      setFreshLink(`${window.location.origin}/send/${rawToken}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create a link.");
    }
  }

  async function onRevoke(id: string) {
    setRevokeError(null);
    const previousTokens = tokens;
    setTokens((prev) =>
      prev.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)),
    );
    try {
      await revokeUploadToken({ data: { id } });
    } catch (err) {
      // Roll back the optimistic flip above -- otherwise a failed revoke
      // (including an RLS-denied one) would leave this link showing
      // "revoked" in the UI while it's still actually active server-side.
      setTokens(previousTokens);
      setRevokeError(err instanceof Error ? err.message : "Couldn't revoke this link.");
    }
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Send a creator an upload link</h2>
      <p className="text-xs text-muted-foreground">
        Good for 7 days, up to 5 files. You review everything before it goes on your profile.
      </p>
      <Button type="button" className="mt-3 h-11" onClick={onCreate}>
        Create a new link
      </Button>

      {createError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {createError}
        </p>
      )}

      {freshLink && (
        <p role="status" className="mt-3 rounded-md border border-open/40 bg-open/10 p-3 text-sm">
          Copy and send this link — it won't be shown again:{" "}
          <span className="break-all font-mono">{freshLink}</span>
        </p>
      )}

      {revokeError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {revokeError}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {tokens.map((token) => (
          <li
            key={token.id}
            className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
          >
            <span>
              {tokenStatus(token)} — {token.used_count}/{token.max_files} used, expires{" "}
              {new Date(token.expires_at).toLocaleDateString()}
            </span>
            {tokenStatus(token) === "active" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => onRevoke(token.id)}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
