# Onboarding wizard & member portal: screen map

A snapshot of the **Member Onboarding Screen Map** Design canvas (owner's claude.ai canvas: https://claude.ai/artifact/UENo3svcNBeNrgM6FMMtLV), taken 25 September 2026.

**This is a lo-fi structure map, not a visual reference.** It shows which screens exist, their order, which member types see them, and who can do what. For look and layout, build every screen against the existing artboards in [`../artboards/`](../artboards/) and the design language in [`../README.md`](../README.md). For behaviour, [`../../member-profiles.md`](../../member-profiles.md), section **Setup wizard, member portal and drafts**, wins over anything drawn here.

| File | What it shows |
| --- | --- |
| `ScreenMap.dc.html` | 1 Getting in (Member Portal link → magic link → wizard or portal) · 2 the ten wizard steps with type branches · 3 Review → Preview → Publish check → You're live · 4 the portal shell with Unpublished changes, Discard and the Finish your profile card |
| `StepAnatomy.dc.html` | One wizard step on a phone: progress, Save & exit, Back / Continue / Skip for now |
| `Roles.dc.html` | Owner / Full editor / Photos & events editor permissions table, the owner-only People section, and the Photos & events editor's two-section view |
| `canvas.json` | Canvas index: artboard sizes, positions and the decision sticky notes (under `notes`) |

The `.dc.html` files are plain HTML with inline styles, readable as-is. The `support.js` they reference isn't needed to read them. `[BRACKETED]` text is placeholder data.

Artboard letters mentioned on the map (F, G, H, I, J, K, M, R, T) refer to the main canvas artboards listed in [`../README.md`](../README.md).
