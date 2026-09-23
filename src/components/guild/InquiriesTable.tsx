import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { markInquiryHandled, setUpInquiryAsMember, type InquiryFilter } from "@/lib/guild/inquiries.server";
import { resolveConfirmationDisplayState } from "@/lib/inquiries/confirmation-state";
import type { InquiryRow, MemberType } from "@/lib/supabase/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CONFIRMATION_LABEL: Record<ReturnType<typeof resolveConfirmationDisplayState>, string> = {
  sent: "Confirmation email sent",
  not_yet_sent: "Confirmation email not yet sent",
  failed_to_send: "Confirmation email failed to send",
};

function formatSentAt(sentAt: string): string {
  return new Date(sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function InquiriesTable({
  inquiries,
  filter,
  onFilterChange,
}: {
  inquiries: InquiryRow[];
  filter: InquiryFilter;
  onFilterChange: (filter: InquiryFilter) => void;
}) {
  const router = useRouter();
  const [convertingId, setConvertingId] = useState<string | null>(null);

  async function handleMarkHandled(inquiry: InquiryRow) {
    await markInquiryHandled({ data: { inquiryId: inquiry.id } });
    await router.invalidate();
  }

  async function handleSetUpAsMember(inquiry: InquiryRow) {
    const city = window.prompt(`City for ${inquiry.name}:`);
    if (!city) return;
    const memberTypeInput = window.prompt("Member type (producer, mobile, or allied):", "producer");
    const memberType = (memberTypeInput ?? "producer") as MemberType;
    setConvertingId(inquiry.id);
    try {
      await setUpInquiryAsMember({ data: { inquiryId: inquiry.id, city, memberType } });
      await router.invalidate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not set up this inquiry as a member.");
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="sr-only" htmlFor="inquiries-filter">
          Filter inquiries
        </label>
        <Select value={filter} onValueChange={(value) => onFilterChange(value as InquiryFilter)}>
          <SelectTrigger id="inquiries-filter" className="h-11 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="handled">Handled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul className="space-y-3">
        {inquiries.map((inquiry) => {
          const confirmationState = resolveConfirmationDisplayState({
            confirmationSentAt: inquiry.confirmation_sent_at,
            createdAt: inquiry.created_at,
            now: Date.now(),
          });
          return (
            <li key={inquiry.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{inquiry.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <a href={`mailto:${inquiry.email}`} className="underline">
                      {inquiry.email}
                    </a>
                    {inquiry.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${inquiry.phone}`} className="underline">
                          {inquiry.phone}
                        </a>
                      </>
                    )}
                  </p>
                  {inquiry.wants_membership_info && (
                    <span className="mt-1 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      Membership lead
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {inquiry.status === "open" && (
                    <button
                      type="button"
                      onClick={() => handleMarkHandled(inquiry)}
                      className="min-h-11 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted"
                    >
                      Mark handled
                    </button>
                  )}
                  {!inquiry.converted_member_id && (
                    <button
                      type="button"
                      onClick={() => handleSetUpAsMember(inquiry)}
                      disabled={convertingId === inquiry.id}
                      className="min-h-11 rounded-md border border-open/50 px-3 py-1 text-sm font-medium text-open hover:bg-open/10"
                    >
                      {convertingId === inquiry.id ? "Setting up…" : "Set them up as a member"}
                    </button>
                  )}
                </div>
              </div>
              {inquiry.message && <p className="mt-2 text-sm">{inquiry.message}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {confirmationState === "sent" && inquiry.confirmation_sent_at
                  ? `Confirmation email sent automatically at ${formatSentAt(inquiry.confirmation_sent_at)}.`
                  : CONFIRMATION_LABEL[confirmationState]}
              </p>
            </li>
          );
        })}
        {inquiries.length === 0 && <li className="py-6 text-center text-muted-foreground">No inquiries here.</li>}
      </ul>
    </div>
  );
}
