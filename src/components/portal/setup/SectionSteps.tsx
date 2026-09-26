import type { MemberDraftBundle } from "@/lib/drafts/drafts.server";
import type { PortalSetupShell } from "@/lib/portal/portal-setup.server";
import type { ScheduleData } from "@/lib/portal/section-data.server";
import type { CategoryRow, MediaAssetRow, UploadTokenRow } from "@/lib/supabase/types";
import { LogoCoverSection } from "@/components/admin/LogoCoverSection";
import { HoursEditor } from "@/components/admin/HoursEditor";
import { EventsEditor } from "@/components/admin/EventsEditor";
import { CalendarConnectionPanel } from "@/components/admin/CalendarConnectionPanel";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CreatorLinkPanel } from "@/components/admin/CreatorLinkPanel";
import { ReviewTray } from "@/components/admin/ReviewTray";
import { LinksContactEditor } from "@/components/admin/LinksContactEditor";
import { DiscountEditor } from "@/components/admin/DiscountEditor";
import { SupplyCategoriesPicker } from "@/components/admin/SupplyCategoriesPicker";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { SaveNoteText } from "@/components/admin/SaveNote";
import { WizardInfoBox, WizardStep } from "@/components/portal/setup/WizardStep";

/**
 * Wizard steps 4-10. Each wraps the portal section's editors unchanged --
 * same components, same fields, same saves (to the member's draft) as
 * /admin -- in the step chrome. Skipping a step saves nothing.
 */

/** Only the owner connects the calendar (calendar_connections writes are owner-only in SQL). */
export function canConnectCalendar(shell: { role: PortalSetupShell["role"]; isImpersonating: boolean }): boolean {
  return shell.role === "owner" || shell.isImpersonating;
}

function CalendarBlock({ shell, schedule }: { shell: PortalSetupShell; schedule: ScheduleData }) {
  return (
    <CalendarConnectionPanel
      memberId={shell.memberId}
      initialConnection={schedule.calendarConnection}
      canEdit={canConnectCalendar(shell)}
    />
  );
}

function RightAwayNote() {
  return <WizardInfoBox>Event changes show on your page right away.</WizardInfoBox>;
}

/** Step 4: Logo & cover (plan Decision 4). Back is hidden: steps 1-3 are closed once setup is done. */
export function LogoCoverStep({
  draft,
  galleryAssets,
}: {
  draft: MemberDraftBundle;
  galleryAssets: MediaAssetRow[];
}) {
  return (
    <WizardStep
      step="logo-cover"
      title="Logo & cover"
      lede="Your logo sits in your page's header. The cover is the wide band across the top."
      backTo={null}
      skipNote="Not ready? Skip it. Without a cover, your theme color fills the band. You can add both later."
    >
      <LogoCoverSection draft={draft} galleryAssets={galleryAssets} />
    </WizardStep>
  );
}

/**
 * Step 5. Producers and Allied Members: weekly hours and holidays
 * (HoursEditor). HoursEditor has no five-day mode, so an Allied Member
 * sees all seven days, with a note to mark the weekend closed. Mobile
 * members: "Where we'll be" -- the calendar subscription link plus dates
 * by hand (plan Decision 7), which is why they have no separate Events
 * step.
 */
export function HoursStep({
  shell,
  draft,
  schedule,
}: {
  shell: PortalSetupShell;
  draft: MemberDraftBundle;
  schedule: ScheduleData | null;
}) {
  if (shell.memberType === "mobile" && schedule) {
    return (
      <WizardStep
        step="hours"
        title="Where we'll be"
        lede="Visitors look for where to find you next. Connect your calendar's subscription link, or add dates by hand."
        skipNote="Not ready? Skip it. You can add dates or connect your calendar any time."
      >
        <CalendarBlock shell={shell} schedule={schedule} />
        <EventsEditor
          memberId={shell.memberId}
          initialEvents={schedule.events}
          memberTimezone={schedule.memberTimezone}
        />
        <RightAwayNote />
      </WizardStep>
    );
  }

  const isAllied = shell.memberType === "allied";
  return (
    <WizardStep
      step="hours"
      title="When you're open"
      lede={
        isAllied
          ? "Your business hours, so members know when to reach you."
          : 'Visitors see "Open now" or "Opens Thursday 3pm" from this.'
      }
      skipNote={`Not ready? Skip it. Your page will say "Hours not listed" and show your phone number until you add them.`}
    >
      {isAllied && (
        <WizardInfoBox>
          Open Monday to Friday? Set those five days and mark Saturday and Sunday closed.
        </WizardInfoBox>
      )}
      <HoursEditor
        memberId={shell.memberId}
        hours={draft.data.basics.hours}
        specialHours={draft.data.basics.special_hours}
      />
      <p className="border-t border-canvas-2 pt-[18px] text-[13px] text-ink-muted">
        <SaveNoteText />
      </p>
    </WizardStep>
  );
}

/** Step 6 (producers and Allied Members): events -- not drafted, live straight away. */
export function EventsStep({
  shell,
  schedule,
}: {
  shell: PortalSetupShell;
  schedule: ScheduleData;
}) {
  return (
    <WizardStep
      step="events"
      title="Events"
      lede="Trivia nights, releases, open houses. Connect a calendar (only the events you tag come in) or add them by hand."
      skipNote="No events coming up? Skip it. You can add them any time."
    >
      <RightAwayNote />
      <CalendarBlock shell={shell} schedule={schedule} />
      <EventsEditor
        memberId={shell.memberId}
        initialEvents={schedule.events}
        memberTimezone={schedule.memberTimezone}
      />
    </WizardStep>
  );
}

/** Step 7: Photos & video, including the creator upload link. */
export function PhotosStep({
  draft,
  assets,
  uploadTokens,
  pending,
}: {
  draft: MemberDraftBundle;
  assets: MediaAssetRow[];
  uploadTokens: UploadTokenRow[];
  pending: MediaAssetRow[];
}) {
  const memberId = draft.member.id;
  return (
    <WizardStep
      step="photos"
      title="Photos & video"
      lede="Up to four slides. Visitors swipe through them on your page, so lead with your best one."
      skipNote="No photos yet? Skip it, or make a link for your photographer to send them straight to you."
    >
      <CarouselEditor
        memberId={memberId}
        initialSlides={draft.data.media.slides}
        galleryAssets={assets}
      />
      <MediaGallery memberId={memberId} assets={assets} />
      <div className="flex flex-col gap-6">
        <CreatorLinkPanel
          memberId={memberId}
          initialTokens={uploadTokens}
          pendingCount={pending.length}
        />
        <ReviewTray initialPending={pending} />
      </div>
      <p className="border-t border-canvas-2 pt-[18px] text-[13px] text-ink-muted">
        <SaveNoteText />
      </p>
    </WizardStep>
  );
}

const THIRD_PILL: Record<PortalSetupShell["memberType"], string> = {
  producer: "Tap list",
  mobile: "Press kit",
  allied: "Catalog",
};

/** Step 8: the link pills (third pill per type: Tap list / Press kit / Catalog). */
export function LinksStep({ shell, draft }: { shell: PortalSetupShell; draft: MemberDraftBundle }) {
  const basics = draft.data.basics;
  return (
    <WizardStep
      step="links"
      title="Links"
      lede={`Website, Instagram, Facebook, TikTok — plus your ${THIRD_PILL[shell.memberType]}. They show as buttons on your page, in this order.`}
      skipNote="Skip it for now and add links whenever you like."
    >
      <LinksContactEditor
        memberId={draft.member.id}
        initialLinks={draft.data.links.links}
        memberType={draft.member.member_type}
        contact={{
          phone: basics.phone,
          contactEmail: basics.contact_email,
          street: basics.street_address,
          city: basics.city,
          state: basics.state,
        }}
        showHeading={false}
      />
    </WizardStep>
  );
}

/** Step 9 (Allied Members only): member discount plus what they supply (plan Decision 8). */
export function DiscountStep({
  draft,
  categories,
}: {
  draft: MemberDraftBundle;
  categories: CategoryRow[];
}) {
  return (
    <WizardStep
      step="discount"
      title="Member discount & supplies"
      lede="What Guild members get from you, and what you supply. The discount shows large near the top of your page."
      skipNote="Skip it for now and add your discount later."
    >
      <DiscountEditor
        memberId={draft.member.id}
        memberType={draft.member.member_type}
        discount={draft.data.discount}
        showHeading={false}
      >
        <SupplyCategoriesPicker
          memberId={draft.member.id}
          categories={categories}
          initialCategoryIds={draft.data.discount.category_ids}
        />
      </DiscountEditor>
    </WizardStep>
  );
}

/** Step 10: Pick your color. */
export function ThemeStep({ draft }: { draft: MemberDraftBundle }) {
  const basics = draft.data.basics;
  return (
    <WizardStep
      step="theme"
      title="Pick your color"
      lede="It carries your buttons, highlights and cover band. Every option is checked so your page stays easy to read."
      skipNote="Skip it and your page keeps Amber."
    >
      <ThemePicker
        memberId={draft.member.id}
        currentTheme={draft.data.theme.theme}
        businessName={basics.business_name}
        city={basics.city}
        state={basics.state}
        tagline={basics.tagline}
        showHeading={false}
      />
    </WizardStep>
  );
}
