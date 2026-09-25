import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPortalStepData } from "@/lib/portal/portal-setup.server";
import { resolveSetupAccess } from "@/lib/portal/wizard-steps";
import { SetupStepView } from "@/components/portal/setup/SetupStepView";

/**
 * /portal/setup/$step: one wizard step, by name (welcome, type, basics,
 * logo-cover, hours, events, photos, links, discount, theme, review, then
 * preview, publish and live). See src/lib/portal/wizard-steps.ts for the
 * order per member type and resolveSetupAccess for who may open what:
 *
 * - before type + basics are done, anything past them goes back to the
 *   first incomplete of welcome / type / basics;
 * - once setup is complete, welcome / type / basics go to /portal, while
 *   steps 4-10 and the finish screens stay open -- the wizard carries on
 *   right after The basics in the same visit ("the wizard is never shown
 *   again" means /portal never routes into it again, not that the
 *   remaining steps lock mid-flow).
 *
 * The step's data comes from getPortalStepData, which resolves the member
 * from the session again; only the step name is sent. gcTime 0: coming
 * back to a step always loads the draft fresh rather than showing a
 * cached copy from before the member's latest edits.
 */
export const Route = createFileRoute("/portal/setup/$step")({
  beforeLoad: ({ context, params }) => {
    const { shell } = context;
    const access = resolveSetupAccess({
      step: params.step,
      memberType: shell.memberType,
      role: shell.role,
      typeConfirmed: shell.typeConfirmed,
      setupCompleted: shell.setupCompleted,
    });
    if (access.kind === "portal") throw redirect({ to: "/portal" });
    if (access.kind === "step") {
      throw redirect({ to: "/portal/setup/$step", params: { step: access.step } });
    }
  },
  loader: ({ params }) => getPortalStepData({ data: { step: params.step } }),
  staleTime: 0,
  gcTime: 0,
  component: StepPage,
});

function StepPage() {
  const data = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  // Keyed by step: moving between steps remounts the editors, so each
  // starts from its own freshly loaded data.
  return <SetupStepView key={data.step} data={data} shell={shell} />;
}
