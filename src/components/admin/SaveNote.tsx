import { useMemberEditing } from "@/components/admin/MemberEditingContext";

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

/**
 * saveNoteText for the member being edited, from the member editing
 * context (provided by the /admin layout and the /portal layouts).
 */
export function SaveNoteText() {
  const editing = useMemberEditing();
  return <>{saveNoteText(editing?.isPublished ?? false)}</>;
}
