import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  choosePortalMember,
  getPortalState,
  type PortalState,
} from "@/lib/portal/portal-session.server";
import { signOutEverything } from "@/lib/auth/sign-out.server";
import type { PortalRole, WizardStepName } from "@/lib/portal/portal-destination";
import {
  BrandBar,
  CanvasCard,
  CanvasHeading,
  cardLinkClass,
  leadClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/public-forms/PublicFormParts";

type PortalSearch = { switch?: boolean };

function validatePortalSearch(search: Record<string, unknown>): PortalSearch {
  return search.switch === true || search.switch === 1 || search.switch === "1"
    ? { switch: true }
    : {};
}

/**
 * /portal: the Member Portal's front door (docs/member-profiles.md, "Getting
 * in" and "Wizard or portal: one rule"). getPortalState does all the
 * deciding server-side -- sign-in check, invite acceptance, which business,
 * wizard or portal. While setup is incomplete it sends the member into the
 * setup wizard (phase 4) at the first of steps 1-3 that isn't done. Once
 * setup is complete it still shows the interim landing page -- the portal
 * itself is phase 5 -- with a "Continue setup" link to the wizard's Review.
 */
export const Route = createFileRoute("/portal/")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  validateSearch: validatePortalSearch,
  loaderDeps: ({ search }) => ({ forceChoose: search.switch === true }),
  loader: async ({ deps }) => {
    const state = await getPortalState({ data: { forceChoose: deps.forceChoose } });
    if (state.kind === "ready" && state.destination.kind === "wizard") {
      throw redirect({ to: "/portal/setup/$step", params: { step: state.destination.step } });
    }
    return state;
  },
  head: () => ({ meta: [{ title: "Member Portal — Inland Southern California Brewers Guild" }] }),
  component: PortalPage,
});

const ROLE_LABELS: Record<PortalRole, string> = {
  owner: "Owner",
  editor: "Full editor",
  media_events: "Photos & events editor",
};

const STEP_LABELS: Record<WizardStepName, string> = {
  welcome: "Welcome",
  type: "Confirm your member type",
  basics: "The basics",
};

const eyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle";

function PortalPage() {
  const state = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-bg pb-10 font-sans">
      <div className="mx-auto w-full max-w-[480px]">
        <BrandBar linkHome />
        <div className="mx-2.5 sm:mx-0 sm:mt-6">
          {state.kind === "ready" && <ReadyCard state={state} />}
          {state.kind === "choose" && <ChooseCard memberships={state.memberships} />}
          {state.kind === "no-member" && <NoMemberCard email={state.email} />}
        </div>
      </div>
    </div>
  );
}

function ReadyCard({ state }: { state: Extract<PortalState, { kind: "ready" }> }) {
  const next =
    state.destination.kind === "wizard"
      ? `Setup: next step is ${STEP_LABELS[state.destination.step]}`
      : "Portal";
  return (
    <CanvasCard>
      <div className="flex flex-col gap-[9px]">
        <p className={eyebrowClass}>Member Portal</p>
        <CanvasHeading>{state.memberName}</CanvasHeading>
        <p className={leadClass}>
          {state.isImpersonating
            ? "You're editing as this member, with owner rights."
            : `You're signed in as: ${ROLE_LABELS[state.role]}.`}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 rounded-[13px] border border-canvas-border bg-white px-[15px] py-3.5">
        <p className={eyebrowClass}>Where you'd go</p>
        <p className="text-[17px] font-semibold text-ink" data-testid="portal-destination">
          {next}
        </p>
        <p className="text-[13px] leading-normal text-ink-muted text-pretty">
          The new portal is still being built. Until it's ready, keep editing in the current admin.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {state.role !== "media_events" && (
          <Link to="/portal/setup/$step" params={{ step: "review" }} className={primaryButtonClass}>
            Continue setup
          </Link>
        )}
        <a
          href="/admin"
          className={state.role !== "media_events" ? secondaryButtonClass : primaryButtonClass}
        >
          Continue in the current admin
        </a>
        {state.adminOpensOtherName && (
          <p className="text-[13px] leading-normal text-ink-muted text-pretty">
            The current admin opens{" "}
            <strong className="font-semibold text-ink">{state.adminOpensOtherName}</strong>, the
            first business linked to your sign-in.
          </p>
        )}
        {state.membershipCount > 1 && (
          <Link to="/portal" search={{ switch: true }} className={secondaryButtonClass}>
            Switch business
          </Link>
        )}
      </div>
    </CanvasCard>
  );
}

function ChooseCard({
  memberships,
}: {
  memberships: Extract<PortalState, { kind: "choose" }>["memberships"];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (memberId: string) => {
    setPending(memberId);
    setError(null);
    try {
      await choosePortalMember({ data: { memberId } });
      await router.navigate({ to: "/portal", search: {} });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open that business.");
    } finally {
      setPending(null);
    }
  };

  return (
    <CanvasCard>
      <div className="flex flex-col gap-[9px]">
        <p className={eyebrowClass}>Member Portal</p>
        <CanvasHeading>Choose a business</CanvasHeading>
        <p className={leadClass}>
          Your sign-in is linked to more than one business. Which one are you working on?
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {memberships.map((m) => (
          <li key={m.memberId}>
            <button
              type="button"
              onClick={() => choose(m.memberId)}
              disabled={pending !== null}
              className="flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-[13px] border border-canvas-border bg-white px-[15px] py-3 text-left transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-[15px] font-semibold text-ink">
                {pending === m.memberId ? "Opening…" : m.businessName}
              </span>
              <span className="text-[13px] text-ink-muted">{ROLE_LABELS[m.role]}</span>
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <p className="text-[13px] leading-[1.55] text-ink-muted text-pretty">
        You can switch businesses later from the portal.
      </p>
    </CanvasCard>
  );
}

function NoMemberCard({ email }: { email: string | null }) {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await signOutEverything();
    } finally {
      window.location.href = "/signin?next=%2Fportal";
    }
  };

  return (
    <CanvasCard>
      <div className="flex flex-col gap-[9px]">
        <p className={eyebrowClass}>Member Portal</p>
        <CanvasHeading>No business is linked to this sign-in</CanvasHeading>
        <p className={leadClass}>
          {email ? (
            <>
              You're signed in as{" "}
              <strong className="font-semibold text-ink break-all">{email}</strong>, but that
              address isn't linked to a member business yet.
            </>
          ) : (
            "Your sign-in isn't linked to a member business yet."
          )}{" "}
          If you were invited, make sure you used the address the invitation was sent to.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className={secondaryButtonClass}
        >
          {signingOut ? "Signing out…" : "Sign in with a different email"}
        </button>
        <p className="text-[13px] leading-[1.55] text-ink-muted text-pretty">
          Think this is a mistake?{" "}
          <Link to="/contact" className={cardLinkClass}>
            Get in touch with the Guild
          </Link>{" "}
          and we'll sort it out.
        </p>
      </div>
    </CanvasCard>
  );
}
