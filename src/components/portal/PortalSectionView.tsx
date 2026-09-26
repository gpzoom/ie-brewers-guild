import type { ReactNode } from "react";
import type { PortalSectionData, PortalShell } from "@/lib/portal/portal-shell.server";
import { BasicsForm } from "@/components/admin/BasicsForm";
import { HoursEditor } from "@/components/admin/HoursEditor";
import { LogoCoverSection } from "@/components/admin/LogoCoverSection";
import { SocialImageEditor } from "@/components/admin/SocialImageEditor";
import { CarouselEditor } from "@/components/admin/CarouselEditor";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CreatorLinkPanel } from "@/components/admin/CreatorLinkPanel";
import { ReviewTray } from "@/components/admin/ReviewTray";
import { EventsEditor } from "@/components/admin/EventsEditor";
import { CalendarConnectionPanel } from "@/components/admin/CalendarConnectionPanel";
import { LinksContactEditor } from "@/components/admin/LinksContactEditor";
import { DiscountEditor } from "@/components/admin/DiscountEditor";
import { SupplyCategoriesPicker } from "@/components/admin/SupplyCategoriesPicker";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { SaveNoteText } from "@/components/admin/SaveNote";
import { InfoBox } from "@/components/admin/basics/ui";
import { canConnectCalendar } from "@/components/portal/setup/SectionSteps";
import { FinishProfileCard } from "@/components/portal/FinishProfileCard";
import { RequestTypeChange } from "@/components/portal/RequestTypeChange";
import { PeopleSection } from "@/components/portal/PeopleSection";

/**
 * One portal section (/portal/$section), from its loaded data. Each is the
 * same editors as the matching wizard step and /admin page -- same
 * components, same saves to the draft (docs/member-profiles.md: "Each
 * wizard step is the portal section with the same content") -- under a
 * section heading instead of the step chrome.
 */

function SectionHeader({ title, lede }: { title: string; lede: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">
        {title}
      </h1>
      <p className="text-pretty text-[13px] text-ink-muted">{lede}</p>
    </header>
  );
}

function SaveNoteFooter() {
  return (
    <p className="border-t border-canvas-2 pt-[18px] text-[13px] text-ink-muted">
      <SaveNoteText />
    </p>
  );
}

/** The Photos & events editor's line about what they can do (Roles map). */
function PhotosEventsNotice({ memberName }: { memberName: string }) {
  return (
    <InfoBox>
      You can edit Photos and Events for{" "}
      <strong className="font-semibold">{memberName}</strong>. Photo changes go live when you
      publish. Event changes show on the page right away.
    </InfoBox>
  );
}

export function PortalSectionView({ data, shell }: { data: PortalSectionData; shell: PortalShell }) {
  const notice = shell.role === "media_events" && <PhotosEventsNotice memberName={shell.memberName} />;

  switch (data.section) {
    case "basics": {
      const basics = data.draft.data.basics;
      return (
        <div className="flex flex-col gap-[22px] md:gap-[30px]">
          {shell.emptySections && (
            <FinishProfileCard sections={shell.emptySections} memberType={shell.memberType} />
          )}
          <BasicsForm
            memberId={shell.memberId}
            memberType={data.draft.member.member_type}
            typeConfirmed={data.draft.member.type_confirmed_at !== null}
            basics={basics}
            email={data.email}
            isImpersonating={shell.isImpersonating}
            typeChange={
              <RequestTypeChange
                currentType={data.draft.member.member_type}
                initialRequest={data.typeChangeRequest}
              />
            }
            hours={
              <HoursEditor
                memberId={shell.memberId}
                hours={basics.hours}
                specialHours={basics.special_hours}
              />
            }
          />
        </div>
      );
    }

    case "logo-cover":
      return (
        <div className="flex flex-col gap-8 md:gap-9">
          <SectionHeader
            title="Logo & cover"
            lede="Your logo sits in your page's header. The cover is the wide band across the top."
          />
          <LogoCoverSection draft={data.draft} galleryAssets={data.galleryAssets} />
          <SocialImageEditor
            memberId={shell.memberId}
            memberType={data.draft.member.member_type}
            ogImageAssetId={data.draft.data.basics.og_image_asset_id}
            galleryAssets={data.galleryAssets}
          />
        </div>
      );

    case "photos":
      return (
        <div className="flex flex-col gap-8 md:gap-9">
          <SectionHeader
            title="Photos"
            lede="Up to four slides. Visitors swipe through them on your page, so lead with your best one."
          />
          {notice}
          <MediaGallery memberId={shell.memberId} assets={data.assets} />
          <CarouselEditor
            memberId={shell.memberId}
            initialSlides={data.draft.data.media.slides}
            galleryAssets={data.assets}
          />
          <div className="flex flex-col gap-6">
            <CreatorLinkPanel
              memberId={shell.memberId}
              initialTokens={data.uploadTokens}
              pendingCount={data.pending.length}
            />
            <ReviewTray initialPending={data.pending} />
          </div>
          <SaveNoteFooter />
        </div>
      );

    case "events":
      return (
        <div className="flex flex-col gap-[26px]">
          <SectionHeader
            title={shell.memberType === "mobile" ? "Where we'll be" : "Events"}
            lede={
              shell.memberType === "mobile"
                ? "Visitors look for where to find you next. Connect your calendar's subscription link, or add dates by hand."
                : "Trivia nights, releases, open houses. Connect a calendar (only the events you tag come in) or add them by hand."
            }
          />
          {notice}
          <InfoBox>Event changes show on your page right away.</InfoBox>
          <CalendarConnectionPanel
            memberId={shell.memberId}
            initialConnection={data.calendarConnection}
            canEdit={canConnectCalendar(shell)}
          />
          <EventsEditor
            memberId={shell.memberId}
            initialEvents={data.events}
            memberTimezone={data.memberTimezone}
          />
        </div>
      );

    case "links": {
      const basics = data.draft.data.basics;
      return (
        <LinksContactEditor
          memberId={shell.memberId}
          initialLinks={data.draft.data.links.links}
          memberType={data.draft.member.member_type}
          contact={{
            phone: basics.phone,
            contactEmail: basics.contact_email,
            street: basics.street_address,
            city: basics.city,
            state: basics.state,
          }}
        />
      );
    }

    case "discount":
      return (
        <DiscountEditor
          memberId={shell.memberId}
          memberType={data.draft.member.member_type}
          discount={data.draft.data.discount}
        >
          <SupplyCategoriesPicker
            memberId={shell.memberId}
            categories={data.categories}
            initialCategoryIds={data.draft.data.discount.category_ids}
          />
        </DiscountEditor>
      );

    case "theme": {
      const basics = data.draft.data.basics;
      return (
        <ThemePicker
          memberId={shell.memberId}
          currentTheme={data.draft.data.theme.theme}
          businessName={basics.business_name}
          city={basics.city}
          state={basics.state}
          tagline={basics.tagline}
        />
      );
    }

    case "people":
      return <PeopleSection people={data.people} invites={data.invites} />;
  }
}
