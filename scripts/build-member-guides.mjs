// Builds one Member Guide PDF per member type from the single source
// docs/member-guide/member-profile-guide.html (owner, 2026-10-17: a guide
// per type, so nobody reads steps that aren't theirs).
//
// In the source:
//   data-type="producer mobile allied"  shown only in those types' guides
//   data-step="basics" etc.             a wizard step: dropped when the type
//                                       doesn't have it, renumbered when it does
//   data-ref-step="links"               "step N" in prose, filled in
//   data-short-steps                    the short setup's step count
//   checklist lines with Producer / Mobile / Affiliate tags, and screenshots
//   with those labels, are kept only for their type (the tags themselves are
//   then dropped: the whole guide is for one type).
//
// Usage: npm run build:guides   (needs Google Chrome installed; uses
// playwright-core, which drives the system browser and downloads none).
// Writes public/member-guide-<type>.pdf and a copy in docs/member-guide/.
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SOURCE = resolve("docs/member-guide/member-profile-guide.html");

// Must match the wizard (src/lib/portal/wizard-steps.ts).
const GUIDES = [
  { type: "producer", file: "producer", docs: "Producer", label: "Producers",
    steps: ["welcome", "basics", "logo-cover", "hours", "events", "links", "theme"], shortSteps: 5 },
  { type: "mobile", file: "mobile", docs: "Mobile", label: "Mobile members",
    steps: ["welcome", "basics", "logo-cover", "hours", "links", "theme"], shortSteps: 4 },
  { type: "allied", file: "affiliate", docs: "Affiliate", label: "Affiliate Members",
    steps: ["welcome", "basics", "logo-cover", "hours", "events", "links", "discount", "theme"], shortSteps: 6 },
];

const browser = await chromium.launch({ executablePath: CHROME });
try {
  for (const guide of GUIDES) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(SOURCE).href, { waitUntil: "networkidle" });
    await page.evaluate(({ type, label, steps, shortSteps }) => {
      const TAG_TYPE = { "t-p": "producer", "t-m": "mobile", "t-a": "allied" };
      const BIGTAG_TYPE = { p: "producer", m: "mobile", a: "allied" };

      for (const el of document.querySelectorAll("[data-type]")) {
        if (!el.dataset.type.split(/\s+/).includes(type)) el.remove();
      }
      for (const el of document.querySelectorAll("[data-step]")) {
        if (!steps.includes(el.dataset.step)) el.remove();
      }
      // Checklist lines tagged for other types go; the type tags go too.
      for (const li of document.querySelectorAll("li")) {
        const tags = [...li.querySelectorAll(".tag:not(.keep)")].filter((t) => Object.keys(TAG_TYPE).some((c) => t.classList.contains(c)));
        if (tags.length === 0) continue;
        const forUs = tags.some((t) => Object.entries(TAG_TYPE).some(([c, ty]) => t.classList.contains(c) && ty === type));
        if (!forUs) li.remove();
        else tags.forEach((t) => t.remove());
      }
      // Screenshots labeled for other types go; type labels and "All members" go.
      for (const big of document.querySelectorAll(".bigtag")) {
        const ty = Object.entries(BIGTAG_TYPE).find(([c]) => big.classList.contains(c))?.[1];
        if (ty && ty !== type) big.closest(".shot")?.remove();
        else if (ty || big.textContent.trim() === "All members") big.remove();
      }
      // Renumber the steps this type has.
      for (const el of document.querySelectorAll("[data-step]")) {
        const n = String(steps.indexOf(el.dataset.step) + 1);
        el.querySelectorAll(":scope .num, :scope .n").forEach((x) => (x.textContent = n));
        el.querySelectorAll(":scope .hint").forEach((x) => (x.textContent = `Step ${n}`));
      }
      for (const el of document.querySelectorAll("[data-ref-step]")) {
        el.textContent = String(steps.indexOf(el.dataset.refStep) + 1);
      }
      for (const el of document.querySelectorAll("[data-short-steps]")) el.textContent = String(shortSteps);
      // The checklist: two columns split where they come out most even,
      // keeping step order (CSS columns page-break badly once one column
      // fills the page).
      const cols = document.querySelector(".cols");
      if (cols) {
        const sections = [...cols.children];
        const heights = sections.map((el) => el.getBoundingClientRect().height);
        const total = heights.reduce((a, b) => a + b, 0);
        let best = 1;
        let bestDiff = Infinity;
        for (let k = 1, run = 0; k < sections.length; k++) {
          run += heights[k - 1];
          const diff = Math.abs(total - 2 * run);
          if (diff < bestDiff) [best, bestDiff] = [k, diff];
        }
        const grid = document.createElement("div");
        grid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; column-gap: 18pt; align-items: start;";
        for (const part of [sections.slice(0, best), sections.slice(best)]) {
          const col = document.createElement("div");
          part.forEach((el) => col.append(el));
          grid.append(col);
        }
        cols.replaceWith(grid);
      }
      // Say whose guide it is.
      const eyebrow = document.querySelector(".band .eyebrow");
      if (eyebrow) eyebrow.textContent = `${eyebrow.textContent} · Guide for ${label}`;
      document.title = `${document.title} (${label})`;
    }, guide);
    const out = resolve(`public/member-guide-${guide.file}.pdf`);
    await page.pdf({ path: out, format: "Letter", printBackground: true, preferCSSPageSize: true });
    copyFileSync(out, resolve(`docs/member-guide/ISC-Brewers-Guild-Member-Guide-${guide.docs}.pdf`));
    await page.close();
    console.log("wrote", out);
  }
} finally {
  await browser.close();
}
