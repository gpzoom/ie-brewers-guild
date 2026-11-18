import { useState } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { getCardView } from "@/lib/tap-card/card-view.server";
import type { CardView } from "@/lib/tap-card/card-view";
import { CanvasHeading, cardLinkClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { TapCardShell, Eyebrow } from "@/components/tap-card/TapCardShell";
import { ActivateForm } from "@/components/tap-card/ActivateForm";
import { CheckInScreen } from "@/components/tap-card/CheckInScreen";

/**
 * /p/<code>: the link on every Inland Tap Card's chip and QR code. A bar
 * device sees the check-in screen; the card's holder goes to their card
 * page; anyone else can turn on a new card. (spec 2026-11-17)
 */
export const Route = createFileRoute("/p/$code")({
  staleTime: 0,
  loader: async ({ params }) => {
    const view = await getCardView({ data: { code: params.code } });
    if (view.view === "customer-own") throw redirect({ to: "/card" });
    return view;
  },
  head: () => ({ meta: [{ title: "Inland Tap Card" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: CardRoute,
});

function CardRoute() {
  const view = Route.useLoaderData();
  return (
    <TapCardShell>
      <CardBody view={view} />
    </TapCardShell>
  );
}

function CardBody({ view }: { view: CardView }) {
  const router = useRouter();
  const [activatedName, setActivatedName] = useState<string | null>(null);

  switch (view.view) {
    case "unknown":
      return (
        <>
          <CanvasHeading size="md">Inland Tap Card</CanvasHeading>
          <p className={leadClass}>We don&rsquo;t recognize this card. Check the code printed on it, or ask the taproom.</p>
        </>
      );
    case "throttled":
      return (
        <>
          <CanvasHeading size="md">Inland Tap Card</CanvasHeading>
          <p className={leadClass}>{view.message}</p>
        </>
      );
    case "staff-blocked":
      return (
        <>
          <Eyebrow>{view.memberName}</Eyebrow>
          <CanvasHeading size="md">This device can&rsquo;t record visits right now</CanvasHeading>
          <p className={leadClass}>
            {view.memberName} isn&rsquo;t on the Inland Tap Card trail at the moment (its page isn&rsquo;t published, or the Guild
            has it off the trail). Ask the Guild if that&rsquo;s a surprise.
          </p>
        </>
      );
    case "staff-activate":
      return (
        <>
          <Eyebrow>{view.memberName}</Eyebrow>
          <CanvasHeading size="md">New card</CanvasHeading>
          {activatedName ? (
            <>
              <p className="text-[20px] font-semibold text-ink">Card activated — checking them in…</p>
            </>
          ) : (
            <ActivateForm
              code={view.code}
              mode="staff"
              onActivated={() => {
                setActivatedName("ok");
                void router.invalidate();
              }}
            />
          )}
        </>
      );
    case "staff-check-in":
      return <CheckInScreen view={view} />;
    case "customer-activate":
      return (
        <>
          <CanvasHeading size="md">Turn on your Inland Tap Card</CanvasHeading>
          <ActivateForm code={view.code} mode="customer" onActivated={() => window.location.assign("/card")} />
        </>
      );
    case "customer-active":
    case "customer-own":
      return (
        <>
          <CanvasHeading size="md">This Inland Tap Card is active</CanvasHeading>
          <p className={leadClass}>Have the bartender tap it at every new taproom on the trail.</p>
          <a href="/card" className={primaryButtonClass}>
            See my card
          </a>
          <a href="/trail" className={cardLinkClass}>
            See the stops and their offers
          </a>
        </>
      );
  }
}
