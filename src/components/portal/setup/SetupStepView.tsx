import type { PortalSetupShell, SetupStepData } from "@/lib/portal/portal-setup.server";
import { BasicsStep, ConfirmTypeStep, WelcomeStep } from "@/components/portal/setup/IntroSteps";
import {
  DiscountStep,
  EventsStep,
  HoursStep,
  LinksStep,
  LogoCoverStep,
  PhotosStep,
  ThemeStep,
} from "@/components/portal/setup/SectionSteps";
import {
  LiveStep,
  PreviewStep,
  PublishStep,
  ReviewStep,
} from "@/components/portal/setup/FinishSteps";

/** Renders one wizard step from its loaded data (src/routes/portal.setup.$step.tsx). */
export function SetupStepView({ data, shell }: { data: SetupStepData; shell: PortalSetupShell }) {
  switch (data.step) {
    case "welcome":
      return <WelcomeStep shell={shell} />;
    case "type":
      return <ConfirmTypeStep shell={shell} />;
    case "basics":
      return <BasicsStep draft={data.draft} />;
    case "logo-cover":
      return <LogoCoverStep draft={data.draft} galleryAssets={data.galleryAssets} />;
    case "hours":
      return <HoursStep shell={shell} draft={data.draft} schedule={data.schedule} />;
    case "events":
      return <EventsStep shell={shell} schedule={data} />;
    case "photos":
      return (
        <PhotosStep
          draft={data.draft}
          assets={data.assets}
          uploadTokens={data.uploadTokens}
          pending={data.pending}
        />
      );
    case "links":
      return <LinksStep shell={shell} draft={data.draft} />;
    case "discount":
      return <DiscountStep draft={data.draft} categories={data.categories} />;
    case "theme":
      return <ThemeStep draft={data.draft} />;
    case "review":
      return (
        <ReviewStep
          shell={shell}
          draft={data.draft}
          eventCount={data.eventCount}
          hasCalendarConnection={data.hasCalendarConnection}
        />
      );
    case "preview":
      return <PreviewStep data={data} />;
    case "publish":
      return <PublishStep shell={shell} gate={data.gate} draftStatus={data.draftStatus} />;
    case "live":
      return <LiveStep shell={shell} />;
  }
}
