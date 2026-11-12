import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { checkUnsubscribe, setBroadcastSubscription } from "@/lib/email/unsubscribe.server";
import { Button } from "@/components/ui/button";

/**
 * Two-step on purpose: the link itself only reads (a mail scanner prefetching
 * it changes nothing); the write happens from the button via a POST server fn.
 */
export const Route = createFileRoute("/unsubscribe/$token")({
  loader: async ({ params }) => checkUnsubscribe({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Guild broadcast emails — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useParams();
  const verdict = Route.useLoaderData();
  const [unsubscribed, setUnsubscribed] = useState(verdict.unsubscribed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!verdict.valid) {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-sm text-muted-foreground">
          This unsubscribe link isn't valid. Reply to any Guild email and we'll take you off the list.
        </p>
      </section>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await setBroadcastSubscription({ data: { token, subscribed: unsubscribed } });
      setUnsubscribed(!unsubscribed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-md px-4 py-24 text-center">
      {unsubscribed ? (
        <>
          <h1 className="font-display text-2xl text-foreground">You won't get Guild broadcast emails anymore</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Other emails about your profile, like sign-in links and hours reminders, still arrive.
          </p>
        </>
      ) : (
        <h1 className="font-display text-2xl text-foreground">Guild broadcast emails</h1>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <Button onClick={toggle} disabled={busy} className="mt-6 h-11 w-full">
        {unsubscribed ? "Subscribe again" : "Unsubscribe from Guild broadcasts"}
      </Button>
    </section>
  );
}
