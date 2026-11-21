import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const FONT_DIR = join(process.cwd(), "public", "fonts", "print-kit");
const FILES = ["BricolageGrotesque-ExtraBold.ttf", "Chivo-Regular.ttf", "Chivo-SemiBold.ttf"];

describe("print-kit fonts", () => {
  it.each(FILES)("embeds %s", async (file) => {
    const bytes = readFileSync(join(FONT_DIR, file));
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(bytes, { subset: true });
    const page = doc.addPage([288, 432]);
    page.drawText("Sample Brewery #1 · SCAN TO CHECK IN", { x: 10, y: 10, size: 12, font });
    const pdf = await doc.save();
    expect(pdf.length).toBeGreaterThan(1000);
    expect(font.widthOfTextAtSize("SCAN", 12)).toBeGreaterThan(0);
  });
});
