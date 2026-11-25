import { useState } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { getCardView } from "@/lib/tap-card/card-view.server";
import type { CardView } from "@/lib/tap-card/card-view";
import { CanvasHeading, cardLinkClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { TapCardShell, Eyebrow } from "@/components/tap-card/TapCardShell";
import { ActivateForm } from "@/components/tap-card/ActivateForm";
import { CheckInScreen } from "@/components/tap-card/CheckInScreen";

/**
 * /p/<code>: the link on every Inland Scan Pass's chip and QR code. A bar
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
  head: () => ({ meta: [{ title: "Inland Scan Pass" }, { name: "robots", content: "noindex, nofollow" }] }),
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
          <CanvasHeading size="md">Inland Scan Pass</CanvasHeading>
          <p className={leadClass}>We don&rsquo;t recognize this pass. Ask the taproom for help.</p>
        </>
      );
    case "throttled":
      return (
        <>
          <CanvasHeading size="md">Inland Scan Pass</CanvasHeading>
          <p className={leadClass}>{view.message}</p>
        </>
      );
    case "staff-blocked":
      return (
        <>
          <Eyebrow>{view.memberName}</Eyebrow>
          <CanvasHeading size="md">This device can&rsquo;t record visits right now</CanvasHeading>
          <p className={leadClass}>
            {view.memberName} currently isn&rsquo;t on the 2027 Inland Beer Trail (its page isn&rsquo;t published, or the Guild
            has it off the trail). Ask the Guild if that&rsquo;s a surprise.
          </p>
        </>
      );
    case "staff-activate":
      return (
        <>
          <Eyebrow>{view.memberName}</Eyebrow>
          <CanvasHeading size="md">New pass</CanvasHeading>
          {activatedName ? (
            <>
              <p className="text-[20px] font-semibold text-ink">Pass activated — checking them in…</p>
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
      // Turning on a printed pass is hidden: passes live on customers' phones (get one at /card/join).
      return (
        <>
          <CanvasHeading size="md">Inland Scan Pass</CanvasHeading>
          <p className={leadClass}>
            Get your Inland Scan Pass on your phone: scan the counter plate at any stop on the trail.
          </p>
          <a href="/trail" className={cardLinkClass}>
            See the stops and their offers
          </a>
        </>
      );
    case "customer-active":
    case "customer-own":
      return (
        <>
          <CanvasHeading size="md">This Inland Scan Pass is active</CanvasHeading>
          <p className={leadClass}>Scan the staff QR code at every new taproom on the trail.</p>
          <a href="/card" className={primaryButtonClass}>
            See my pass
          </a>
          <a href="/trail" className={cardLinkClass}>
            See the stops and their offers
          </a>
        </>
      );
  }
}
