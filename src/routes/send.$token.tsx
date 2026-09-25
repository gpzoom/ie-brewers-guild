import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { submitCreatorUpload } from "@/lib/media/creator-upload.server";
import { appendMeasuredDimensions } from "@/lib/media/image-dimensions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Upload failed, please try again.");
    }
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
