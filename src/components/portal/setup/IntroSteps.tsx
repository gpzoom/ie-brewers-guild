import { useState } from "react";
import { completePortalSetup, confirmPortalMemberType } from "@/lib/portal/portal-setup.server";
import type { PortalSetupShell } from "@/lib/portal/portal-setup.server";
import type { MemberDraftBundle } from "@/lib/drafts/drafts.server";
import { MEMBER_TYPE_OPTIONS } from "@/lib/members/member-type-options";
import type { CategoryRow, MemberType } from "@/lib/supabase/types";
import { BasicsForm } from "@/components/admin/BasicsForm";
import { SupplyCategoriesPicker } from "@/components/admin/SupplyCategoriesPicker";
import {
  WizardInfoBox,
  WizardStep,
  wizardPrimaryButtonClass,
} from "@/components/portal/setup/WizardStep";
import { useWizardNavigation } from "@/components/portal/setup/useWizardNavigation";
import { MemberGuideNote } from "@/components/portal/MemberGuideLink";
import { cn } from "@/lib/utils";

/** Step 1's "What to have handy" list, per member type. */
export function welcomeHandyItems(memberType: MemberType): { title: string; body: string }[] {
  const isMobile = memberType === "mobile";
  const isAffiliate = memberType === "allied";
  return [
    {
      title: "Your logo, as a PNG",
      body: "Ideally with a transparent background and at least 400px tall. No PNG? You can get one made for free; step 4 shows you how.",
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

/** Step 1: what to have handy, how long it takes, what can wait. */
export function WelcomeStep({ shell }: { shell: PortalSetupShell }) {
  const handy = welcomeHandyItems(shell.memberType);

  return (
    <WizardStep
      step="welcome"
      title="Let's set up your profile"
      lede={
        <>
          It takes about 10 minutes. Only the first three steps are needed to get started —
          everything after <strong className="font-semibold text-ink">The basics</strong> can be
          skipped and finished later.
          <MemberGuideNote />
        </>
      }
      continueLabel="Get started"
    >
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

function TypeCard({
  type,
  selected,
  onSelect,
  asRadio,
}: {
  type: MemberType;
  selected: boolean;
  onSelect?: () => void;
  asRadio: boolean;
}) {
  const option = MEMBER_TYPE_OPTIONS.find((o) => o.value === type)!;
  const body = (
    <span className="flex flex-col gap-1">
      <span className="text-[15px] font-semibold text-ink">{option.title}</span>
      <span className="text-[13px] leading-[1.45] text-ink-muted">{option.description}</span>
    </span>
  );
  if (!asRadio) {
    return (
      <div className="rounded-[12px] border-2 border-ink bg-white px-[17px] py-[15px]">{body}</div>
    );
  }
  return (
    <label
      htmlFor={`confirm-type-${type}`}
      className={cn(
        "flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[12px] bg-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
        selected
          ? "border-2 border-ink px-[16px] py-[14px]"
          : "border border-canvas-border px-[17px] py-[15px] hover:border-ink-subtle",
      )}
    >
      <input
        type="radio"
        id={`confirm-type-${type}`}
        name="confirm-member-type"
        checked={selected}
        onChange={onSelect}
        className="mt-0.5 h-[19px] w-[19px] shrink-0 cursor-pointer accent-ink"
      />
      {body}
    </label>
  );
}

/**
 * Step 2: the type the Guild set, with "Yes, that's us". "That's not
 * right" opens the other two. Either way, confirming locks the type for
 * the member (confirm_member_type); picking a different one also emails
 * the Guild.
 */
export function ConfirmTypeStep({ shell }: { shell: PortalSetupShell }) {
  const { goTo } = useWizardNavigation();
  const [showOthers, setShowOthers] = useState(false);
  const [picked, setPicked] = useState<MemberType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = MEMBER_TYPE_OPTIONS.map((o) => o.value).filter((t) => t !== shell.memberType);
  const pickedTitle = MEMBER_TYPE_OPTIONS.find((o) => o.value === picked)?.title;

  async function confirm(type: MemberType) {
    setBusy(true);
    setError(null);
    try {
      await confirmPortalMemberType({ data: { memberType: type } });
      await goTo("basics");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm your type — try again.");
      setBusy(false);
    }
  }

  // Already confirmed (Back from The basics, or a later visit): show the
  // locked type and carry on -- confirming again isn't possible.
  if (shell.typeConfirmed) {
    return (
      <WizardStep
        step="type"
        title="Confirm your member type"
        lede="The Guild chose this when your profile was set up. It decides which sections your page shows."
      >
        <TypeCard type={shell.memberType} selected asRadio={false} />
        <WizardInfoBox>
          Your type is confirmed and locked. If it ever needs to change, use Request a type change
          in your portal.
        </WizardInfoBox>
      </WizardStep>
    );
  }

  return (
    <WizardStep
      step="type"
      title="Confirm your member type"
      lede="The Guild chose this when your profile was set up. It decides which sections your page shows."
      hideContinue
      error={error}
    >
      <div className="flex flex-col gap-3">
        <TypeCard type={shell.memberType} selected asRadio={false} />
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm(shell.memberType)}
          className={cn(wizardPrimaryButtonClass, "w-full flex-none")}
        >
          {busy && picked === null ? "Confirming…" : "Yes, that's us"}
        </button>
        {!showOthers && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowOthers(true)}
            className="flex min-h-11 items-center justify-center text-[14px] font-medium text-brand underline-offset-2 hover:text-brand-hover hover:underline disabled:opacity-60"
          >
            That's not right
          </button>
        )}
      </div>

      {showOthers && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
            Which one fits?
          </legend>
          {others.map((type) => (
            <TypeCard
              key={type}
              type={type}
              selected={picked === type}
              onSelect={() => setPicked(type)}
              asRadio
            />
          ))}
          <button
            type="button"
            disabled={busy || picked === null}
            onClick={() => picked && void confirm(picked)}
            className={cn(wizardPrimaryButtonClass, "w-full flex-none")}
          >
            {busy && picked !== null
              ? "Confirming…"
              : pickedTitle
                ? `Confirm: ${pickedTitle}`
                : "Choose a type"}
          </button>
          <p className="text-[13px] leading-[1.45] text-ink-muted">
            We'll let the Guild know you changed it.
          </p>
        </fieldset>
      )}

      <WizardInfoBox>
        Once you confirm, your type is locked. If it ever needs to change, the Guild can change it
        for you.
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
      backTo="type"
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
