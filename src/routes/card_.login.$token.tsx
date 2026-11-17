import { createFileRoute, redirect } from "@tanstack/react-router";
import { consumeHolderLogin } from "@/lib/tap-card/holder.server";
import { CanvasHeading, cardLinkClass, leadClass } from "@/components/public-forms/PublicFormParts";
import { TapCardShell } from "@/components/tap-card/TapCardShell";

/** The emailed Tap Card sign-in link. */
export const Route = createFileRoute("/card_/login/$token")({
  loader: async ({ params }) => {
    const result = await consumeHolderLogin({ data: { token: params.token } });
    if (result.ok) throw redirect({ to: "/card" });
    return result;
  },
  head: () => ({ meta: [{ title: "Sign in — Inland Tap Card" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => (
    <TapCardShell>
      <CanvasHeading size="md">This link has expired</CanvasHeading>
      <p className={leadClass}>
        Sign-in links work once, for 60 minutes.{" "}
        <a href="/card/signin" className={cardLinkClass}>
          Send a new link
        </a>
      </p>
    </TapCardShell>
  ),
});
