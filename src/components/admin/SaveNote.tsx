import { getRouteApi } from "@tanstack/react-router";

/**
 * The "how saving works" line under editing pages and in the phone publish
 * bar. Every edit writes straight to the member's real row -- there is no
 * separate draft copy -- so for a published member changes are live at
 * once; publishing only ever matters while the profile is still a draft.
 * (The artboards' "Publishing needs one more step" implied otherwise.)
 */
export function saveNoteText(isPublished: boolean): string {
  return isPublished
    ? "Changes save automatically and appear on your live profile right away."
    : "Changes save automatically. Your profile stays hidden until you publish it.";
}

const adminRoute = getRouteApi("/admin");

/** saveNoteText for the member being edited, from the /admin layout's loader. */
export function SaveNoteText() {
  const { publishGateData } = adminRoute.useLoaderData();
  return <>{saveNoteText(publishGateData.status === "published")}</>;
}
