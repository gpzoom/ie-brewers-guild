import { createServerFn } from "@tanstack/react-start";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { approvedLogoUrl, printKitInfoFromRow, type PrintKitInfo } from "@/lib/tap-card/print-kit-info";

/**
 * Portal/Admin > Scan Pass > Print kit: the member's name, slug, logo and
 * logo tile for the printed counter card. Same editors as the counter plate
 * (owner, co-owner, full editor, or a Guild admin using Edit as them). The
 * published members row is the look customers see, so the kit uses it.
 */
export const getPrintKitInfo = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<PrintKitInfo> => {
    const { service, trailStop } = await requireTapCardEditor(data.memberId);
    const { data: member, error } = await service
      .from("members")
      .select("business_name, slug, logo_asset_id, logo_background, theme")
      .eq("id", data.memberId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!member) throw new Error("Member not found.");

    const logoUrl = await approvedLogoUrl(service as unknown as Parameters<typeof approvedLogoUrl>[0], member.logo_asset_id);
    return printKitInfoFromRow(member, trailStop, logoUrl);
  });
