import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { checkHoursConfirmToken, confirmHoursStale } from "@/lib/hours/confirm-token.server";
import { Button } from "@/components/ui/button";

/**
 * A real two-step page, not a bare GET-redirect API route -- deliberately
 * NOT the given brief code's single `server.handlers.GET` that verified the
 * token AND wrote hours_confirmed_at AND redirected, all inside one
 * unauthenticated GET.
 *
 * Two reasons that shape is wrong for an emailed link specifically:
 *
 * 1. Corporate email security scanners (Microsoft Defender for Office 365
 *    Safe Links, Proofpoint, Mimecast, and others) routinely auto-visit
 *    every link in an inbound email BEFORE the recipient opens it, to scan
 *    for phishing/malware. That's standard, widely-deployed behavior, not a
 *    hypothetical. If the state change happened on GET, a scanner would
 *    silently "confirm" the member's hours before the member ever saw the
 *    email -- exactly defeating the point of the feature (getting the
 *    member to actually look at and verify their hours).
 * 2. A silent `redirect({ href: "/" })` with no acknowledgment is a bad
 *    experience even ignoring (1): a member who clicks the link deserves to
 *    see that something happened.
 *
 * So: the loader only calls checkHoursConfirmToken (GET, read-only, no DB
 * write) to decide what to render. The actual write only happens from
 * confirmHoursStale (POST), called directly by the button's onClick --
 * never from a route-level server.handlers.POST. This mirrors
 * send.$token.tsx/creator-upload.server.ts's already-discovered gotcha: a
 * createServerFn is only reachable in the built Worker if something in the
 * CLIENT bundle actually calls it; routing through a route-level POST
 * handler that calls it server-side leaves the client bundle with no
 * reference to it, so the compiler never emits its RPC provider module and
 * every real request 400s.
 */
export const Route = createFileRoute("/api/confirm-hours/$token")({
  loader: async ({ params }) => checkHoursConfirmToken({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Confirm your hours — Inland Southern California Brewers Guild" },
      // Unguessable one-off action URL (a signed, member-specific token),
      // same reasoning as survey.tsx/survey-results.tsx: no reason for a
      // search engine to ever index it. Not a security control -- the
      // HMAC signature is -- just a cheap, correct thing to add.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConfirmHoursPage,
});

function ConfirmHoursPage() {
  const { token } = Route.useParams();
  const verdict = Route.useLoaderData();
  const [status, setStatus] = useState<"idle" | "confirming" | "confirmed" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!verdict.valid) {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl text-foreground">This link isn't valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">{verdict.reason}</p>
      </section>
    );
  }

  if (status === "confirmed") {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl text-foreground">Thanks — your hours are confirmed.</h1>
      </section>
    );
  }

  const onConfirm = async () => {
    setStatus("confirming");
    setErrorMessage(null);
    try {
      await confirmHoursStale({ data: { token } });
      setStatus("confirmed");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong, please try again.");
    }
  };

  return (
    <section className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-2xl text-foreground">Are your hours still accurate?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It's been a while since anyone confirmed the hours on your Guild profile. If they're still
        correct, let us know below.
      </p>

      {status === "error" && errorMessage && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button onClick={onConfirm} disabled={status === "confirming"} className="mt-6 h-11 w-full">
        {status === "confirming" ? "Confirming…" : "Yes, my hours are still accurate"}
      </Button>
    </section>
  );
}
