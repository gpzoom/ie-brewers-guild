import { createFileRoute, redirect } from "@tanstack/react-router";
import { consumeHolderLogin } from "@/lib/tap-card/holder.server";
import { safeHolderNext } from "@/lib/tap-card/plate";
import { CanvasHeading, cardLinkClass, leadClass } from "@/components/public-forms/PublicFormParts";
import { TapCardShell } from "@/components/tap-card/TapCardShell";

/** The emailed Tap Card sign-in link. */
export const Route = createFileRoute("/card_/login/$token")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = safeHolderNext(search.next);
    return next ? { next } : {};
  },
  loaderDeps: ({ search }) => ({ next: search.next }),
  loader: async ({ params, deps }) => {
    const result = await consumeHolderLogin({ data: { token: params.token } });
    if (result.ok) {
      // Back to the counter plate they were at, or their card page.
      if (deps.next?.startsWith("/t/")) throw redirect({ to: "/t/$code", params: { code: deps.next.slice(3) } });
      throw redirect({ to: "/card" });
    }
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
