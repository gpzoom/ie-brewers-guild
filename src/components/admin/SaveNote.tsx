import { getRouteApi } from "@tanstack/react-router";

/**
 * The "how saving works" line under editing pages and in the phone publish
 * bar. Every edit saves to the member's draft as they type; nothing reaches
 * the live page until they publish (plan phase 2). Worded for the two
 * cases so it's never wrong: a live page changes when you publish; a
 * never-published one stays hidden until you publish it.
 */
export function saveNoteText(isPublished: boolean): string {
  return isPublished
    ? "Changes save as you type and go live when you publish."
    : "Changes save as you type. Your profile stays hidden until you publish it.";
}

const adminRoute = getRouteApi("/admin");

/** saveNoteText for the member being edited, from the /admin layout's loader. */
export function SaveNoteText() {
  const { publishGateData } = adminRoute.useLoaderData();
  return <>{saveNoteText(publishGateData.status === "published")}</>;
}
