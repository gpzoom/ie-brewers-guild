import { useState } from "react";
import { completePortalSetup, confirmPortalMemberType } from "@/lib/portal/portal-setup.server";
import type { PortalSetupShell } from "@/lib/portal/portal-setup.server";
import type { MemberDraftBundle } from "@/lib/drafts/drafts.server";
import type { CategoryRow, MemberType } from "@/lib/supabase/types";
import { BasicsForm } from "@/components/admin/BasicsForm";
import { SupplyCategoriesPicker } from "@/components/admin/SupplyCategoriesPicker";
import { WizardInfoBox, WizardStep } from "@/components/portal/setup/WizardStep";
import { MEMBER_TYPE_SHORT_LABEL } from "@/lib/members/member-type-options";
import { MemberTypeTag } from "@/components/portal/setup/MemberTypeTag";
import { useMemberEditing } from "@/components/admin/MemberEditingContext";
import { useWizardNavigation } from "@/components/portal/setup/useWizardNavigation";
import { MemberGuideNote } from "@/components/portal/MemberGuideLink";

/** Step 1's "What to have handy" list, per member type. */
export function welcomeHandyItems(memberType: MemberType): { title: string; body: string }[] {
  const isMobile = memberType === "mobile";
  const isAffiliate = memberType === "allied";
  return [
    {
      title: "Your logo, as a PNG",
      body: "Ideally with a transparent background and at least 400px tall. No PNG? You can get one made for free; step 3 shows you how.",
    },
    {
      title: "A few photos",
      body: "JPG or PNG. Up to four for the slides on your page (tall photos work best), and a wide one for your cover.",
    },
    isMobile
      ? {
          title: "Where you'll be",
          body: "Your calendar's subscription link, or the dates and places you'll be out, to add by hand.",
        }
      : {
          title: isAffiliate ? "Your business hours" : "Your hours",
          body: "The days and times you're open, plus any holidays coming up.",
        },
    ...(isAffiliate
      ? [
          {
            title: "Your member discount",
            body: "What Guild members get from you, how they redeem it, and what you supply.",
          },
        ]
      : []),
  ];
}

/**
 * Step 1: the type the Guild set, what to have handy, how long it takes,
 * what can wait. Get started confirms the type (confirm_member_type locks
 * it for the member and complete_member_setup requires it), then goes to
 * The basics. There is no separate "Confirm your member type" step: the
 * Guild always chooses the type, and a wrong one goes through Request a
 * type change after setup.
 */
export function WelcomeStep({ shell }: { shell: PortalSetupShell }) {
  const handy = welcomeHandyItems(shell.memberType);
  const { goTo } = useWizardNavigation();
  const [error, setError] = useState<string | null>(null);
  const article = shell.memberType === "allied" ? "an" : "a";

  async function onGetStarted() {
    setError(null);
    try {
      // Always called: the server confirms only if still unconfirmed, so a
      // stale tab (confirmed elsewhere) just carries on.
      await confirmPortalMemberType();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get you started — try again.");
      return;
    }
    await goTo("basics");
  }

  return (
    <WizardStep
      step="welcome"
      title="Let's set up your profile"
      lede={
        <>
          It takes about 10 minutes. Only the first two steps are needed to get started —
          everything after <strong className="font-semibold text-ink">The basics</strong> can be
          skipped and finished later.
          <MemberGuideNote memberType={shell.memberType} />
        </>
      }
      continueLabel="Get started"
      onContinue={onGetStarted}
      error={error}
    >
      <section
        aria-label="Your member type"
        className="flex flex-col gap-2 rounded-[12px] border border-canvas-border bg-white px-[14px] py-3"
      >
        <p className="m-0 flex flex-wrap items-center gap-2 text-[15px] text-ink">
          <span>
            You're set up as {article}{" "}
            <strong className="font-semibold">{MEMBER_TYPE_SHORT_LABEL[shell.memberType]}</strong>
          </span>
          <MemberTypeTag memberType={shell.memberType} />
        </p>
        <p className="m-0 text-[13px] leading-[1.45] text-ink-muted">
          Not right? After setup, use{" "}
          <strong className="font-semibold text-ink">Request a type change</strong> on your Basics
          page.
        </p>
      </section>
      <section aria-labelledby="handy-heading" className="flex flex-col gap-3">
        <h2
          id="handy-heading"
          className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted"
        >
          What to have handy
        </h2>
        <ul className="flex flex-col gap-2">
          {handy.map((item) => (
            <li
              key={item.title}
              className="flex flex-col gap-1 rounded-[12px] border border-canvas-border bg-white px-[14px] py-3"
            >
              <span className="text-[15px] font-semibold text-ink">{item.title}</span>
              <span className="text-[13px] leading-[1.45] text-ink-muted">{item.body}</span>
            </li>
          ))}
        </ul>
      </section>
      <WizardInfoBox>
        Don't have something yet? Skip that step. Anything you skip, you can finish later from your
        portal. Your page stays hidden until you publish it.
      </WizardInfoBox>
    </WizardStep>
  );
}

/** The inputs BasicsForm renders for the two required fields (uncontrolled, by id). */
function readRequiredField(id: string): string | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el.value : null;
}

/**
 * Step 3: the Basics part of BasicsForm, without the logo and hours (they
 * have their own steps). Member type shows read-only -- it was just
 * confirmed. Continue checks name and city, lets the last edits save, then
 * complete_member_setup re-checks them in the DRAFT and ends setup.
 */
export function BasicsStep({
  draft,
  categories,
}: {
  draft: MemberDraftBundle;
  categories: CategoryRow[];
}) {
  const { goTo, settle } = useWizardNavigation();
  const editing = useMemberEditing();
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    setError(null);
    // BasicsForm refuses to save an emptied required field (the draft keeps
    // the old value), so check what's on screen too.
    const missing = [
      readRequiredField("business_name")?.trim() === "" ? "your business name" : null,
      readRequiredField("city")?.trim() === "" ? "your city" : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      setError(`Add ${missing.join(" and ")} to continue.`);
      return;
    }
    await settle();
    try {
      await completePortalSetup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't finish this step — try again.");
      return;
    }
    await goTo("logo-cover");
  }

  return (
    <WizardStep
      step="basics"
      title="The basics"
      lede="Your business name and city are required. The rest helps visitors find and reach you."
      // Short setup starts here: there's nothing to go back to.
      backTo={editing?.shortSetup ? null : "welcome"}
      onContinue={onContinue}
      error={error}
    >
      <BasicsForm
        memberId={draft.member.id}
        memberType={draft.member.member_type}
        typeConfirmed
        basics={draft.data.basics}
        categories={
          draft.member.member_type === "mobile" && (
            <SupplyCategoriesPicker
              memberId={draft.member.id}
              memberType="mobile"
              categories={categories}
              initialCategoryIds={draft.data.discount.category_ids}
            />
          )
        }
        showHeading={false}
      />
    </WizardStep>
  );
}
