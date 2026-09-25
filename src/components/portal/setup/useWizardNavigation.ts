import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { draftSaveQueue } from "@/lib/drafts/save-queue";
import type { SetupStepName } from "@/lib/portal/wizard-steps";
import { useMemberEditing } from "@/components/admin/MemberEditingContext";

/**
 * Moving between wizard steps without losing an edit. Every editor saves
 * as the member types (debounced, flushed on blur) through the one draft
 * save queue (src/lib/drafts/save-queue.ts), so before leaving a step:
 * blur the focused field -- its onBlur flushes any debounced save into the
 * queue -- then wait until nothing for this member is queued or running.
 * Only then navigate, so the next step (and Review) load what was just
 * typed. The same settle PublishGateDialog does before publishing.
 */
export function useWizardNavigation() {
  const navigate = useNavigate();
  const memberId = useMemberEditing()?.memberId ?? "";

  const settle = useCallback(async () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    await draftSaveQueue.whenIdle(`${memberId}:`);
  }, [memberId]);

  const goTo = useCallback(
    async (step: SetupStepName) => {
      await settle();
      await navigate({ to: "/portal/setup/$step", params: { step } });
    },
    [navigate, settle],
  );

  /**
   * Save & exit: finish saving, then leave for the site's home page. The
   * next visit to /portal picks up where the rule says: back in the wizard
   * if steps 1-3 aren't done, otherwise the portal.
   */
  const exit = useCallback(async () => {
    await settle();
    await navigate({ to: "/" });
  }, [navigate, settle]);

  return { settle, goTo, exit };
}
