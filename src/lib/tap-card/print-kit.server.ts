import { createServerFn } from "@tanstack/react-start";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { printKitInfoFromRow, type PrintKitInfo } from "@/lib/tap-card/print-kit-info";

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

    let logoUrl: string | null = null;
    if (member.logo_asset_id) {
      const { data: asset } = await service.from("media_assets").select("storage_path").eq("id", member.logo_asset_id).maybeSingle();
      const path = (asset?.storage_path as string | undefined) ?? null;
      if (path) logoUrl = service.storage.from("member-logos").getPublicUrl(path).data.publicUrl;
    }
    return printKitInfoFromRow(member, trailStop, logoUrl);
  });
