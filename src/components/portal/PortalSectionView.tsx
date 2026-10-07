import type { ReactNode } from "react";
import type { PortalSectionData, PortalShell } from "@/lib/portal/portal-shell.server";
import { BasicsForm } from "@/components/admin/BasicsForm";
import { HoursEditor } from "@/components/admin/HoursEditor";
import { LogoPhotosCoverSection } from "@/components/admin/LogoPhotosCoverSection";
import { EventsEditor } from "@/components/admin/EventsEditor";
import { GuestStopsBox } from "@/components/admin/GuestStopsBox";
import { CalendarConnectionPanel } from "@/components/admin/CalendarConnectionPanel";
import { FoodCalendarSection } from "@/components/admin/FoodCalendarSection";
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
            canChangeSignInEmail={data.canChangeSignInEmail}
            categories={
              data.draft.member.member_type === "mobile" && (
                <SupplyCategoriesPicker
                  memberId={shell.memberId}
                  memberType="mobile"
                  categories={data.categories}
                  initialCategoryIds={data.draft.data.discount.category_ids}
                />
              )
            }
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
            title="Logo, Photos & Cover"
            lede="Your logo, the photos for your page, and the wide cover across the top. Start with the gallery: your slides and cover are picked from it."
          />
          {notice}
          <LogoPhotosCoverSection
            draft={data.draft}
            assets={data.assets}
            uploadTokens={data.uploadTokens}
            pending={data.pending}
            canEditLogoAndCover={shell.role !== "media_events"}
            peopleHref="/portal/people"
            showSocialImage={shell.role !== "media_events"}
          />
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
          {/* Guild Mobile members at taprooms (artboard GV1): producers only. */}
          {shell.memberType === "producer" && (
            <GuestStopsBox memberId={shell.memberId} timezone={data.memberTimezone} />
          )}
        </div>
      );

    case "food":
      return (
        <div className="flex flex-col gap-[26px]">
          {notice}
          {data.food ? (
            <FoodCalendarSection
              memberId={shell.memberId}
              food={data.food}
              memberTimezone={data.memberTimezone}
              canEdit={canConnectCalendar(shell)}
              asPage
            />
          ) : (
            <InfoBox>The food calendar is only for Producers.</InfoBox>
          )}
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
