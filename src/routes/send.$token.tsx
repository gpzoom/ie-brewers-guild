import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { submitCreatorUpload } from "@/lib/media/creator-upload.server";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * No auth. This is an early-exit convenience, NOT the actual rate-limit
 * enforcement -- every createServerFn (including submitCreatorUpload) gets
 * its own independently-reachable RPC endpoint that TanStack Start
 * dispatches to directly, before this route's own server.handlers.POST is
 * ever matched, so a check that lived ONLY here could be bypassed entirely
 * by calling that RPC endpoint directly. The real enforcement lives inside
 * submitCreatorUpload itself (see that file's doc comment), keyed on the
 * hashed token so it holds no matter how the function is invoked. Checking
 * env.CREATOR_UPLOAD_RATE_LIMITER here too is still worthwhile: it's a
 * cheap way to short-circuit an obviously-throttled request (by the raw
 * token embedded in the URL) before paying for a request body parse and
 * the DB/crypto work submitCreatorUpload's own check duplicates.
 */
export const Route = createFileRoute("/send/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { env } = await import("cloudflare:workers");
        const rateLimiter = (
          env as {
            CREATOR_UPLOAD_RATE_LIMITER?: {
              limit: (opts: { key: string }) => Promise<{ success: boolean }>;
            };
          }
        ).CREATOR_UPLOAD_RATE_LIMITER;
        const { success } = (await rateLimiter?.limit({ key: params.token })) ?? { success: true };
        if (!success) {
          return new Response("Too many upload attempts. Try again in a minute.", { status: 429 });
        }
        const formData = await request.formData();
        formData.set("token", params.token);
        try {
          await submitCreatorUpload({ data: formData });
          return new Response(null, { status: 204 });
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "Upload failed.", {
            status: 400,
          });
        }
      },
    },
  },
  head: () => ({ meta: [{ title: "Share a photo — IE Brewers Guild" }] }),
  component: SendPage,
});

function SendPage() {
  const { token } = Route.useParams();
  const [creatorName, setCreatorName] = useState("");
  const [creditRequested, setCreditRequested] = useState(false);
  const [permissionAccepted, setPermissionAccepted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setStatus("sending");
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("creatorName", creatorName);
    formData.set("creditRequested", String(creditRequested));
    formData.set("permissionAccepted", String(permissionAccepted));
    formData.set("file", file);

    const response = await fetch(`/send/${token}`, { method: "POST", body: formData });
    if (!response.ok) {
      setStatus("error");
      setErrorMessage(await response.text());
      return;
    }
    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl text-foreground">Thanks — got it.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The member will review it before it goes on their profile.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-2xl text-foreground">Share a photo or video</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="creator-name">Your name or handle</Label>
          <Input
            id="creator-name"
            required
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            className="mt-1 h-11"
          />
        </div>

        <label className="flex min-h-11 items-center gap-2">
          <Checkbox
            checked={creditRequested}
            onCheckedChange={(checked) => setCreditRequested(checked === true)}
          />
          <span>Credit me by name on the profile</span>
        </label>

        <div>
          <Label htmlFor="creator-file">File</Label>
          <input
            id="creator-file"
            type="file"
            required
            accept="image/png,image/jpeg"
            className="mt-1 block h-11 w-full"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <label className="flex min-h-11 items-start gap-2">
          <Checkbox
            checked={permissionAccepted}
            onCheckedChange={(checked) => setPermissionAccepted(checked === true)}
          />
          <span className="text-sm">
            I took this photo/video (or have the rights to share it) and give permission to use it
            on this profile.
          </span>
        </label>

        {status === "error" && errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <Button
          type="submit"
          disabled={!permissionAccepted || status === "sending"}
          className="h-11 w-full"
        >
          {status === "sending" ? "Sending…" : "Send"}
        </Button>
      </form>
    </section>
  );
}
