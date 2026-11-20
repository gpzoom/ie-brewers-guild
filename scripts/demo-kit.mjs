// Scan Pass demo kit (owner, 2026-11-20). Works ONLY on the demo cast: draft
// members whose name starts with "Sample ". Staging and live share one
// database, so it refuses anything else. Run it from the repo root.
//
//   node scripts/demo-kit.mjs                 status: the cast, plates, rewards, demo data
//   node scripts/demo-kit.mjs setup [--yes]   plates + staff code 2468 + demo rewards (approved)
//   node scripts/demo-kit.mjs print           print sheet: counter plates + staff QR codes (staging links)
//   node scripts/demo-kit.mjs reset [--yes]   between demos: clear visits and rewards at the Sample members
//   node scripts/demo-kit.mjs teardown [--yes] [--passes]
//                                             reset, plus demo customers, sign-ups and email opt-ins;
//                                             --passes also deletes Beer Trail Passes credited to Samples
//
// Without --yes, setup/reset/teardown only say what they would do.
// Reads the service key from .dev.vars and never prints it. Sends no emails.
// Demo customers are made on the demo phones (Zeffy join with the 100% code,
// or "Just get the free loyalty pass"), never by this script.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

const STAGING_SITE = "https://ie-brewers-guild-staging.boblelle77.workers.dev";
const DEMO_STAFF_CODE = "2468";
const PRINT_DIR = ".demo-kit";

/** The demo rewards, by slug. Members not listed keep whatever rewards they have. */
const DEMO_REWARDS = {
  "sample-brewery-2": [
    { slot: "step1", visitNumber: 2, reward: "Free snack", terms: "With any pint." },
    { slot: "repeat", visitNumber: 5, reward: "$2 off a pint", terms: "" },
  ],
  "sample-brewery-3": [
    { slot: "step1", visitNumber: 1, reward: "Free taster flight", terms: "Welcome! First visit only." },
    { slot: "repeat", visitNumber: 4, reward: "$1 off a pint", terms: "" },
  ],
};

const vars = Object.fromEntries(
  fs
    .readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const db = createClient(vars.VITE_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const command = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "status";
const apply = process.argv.includes("--yes");
const withPasses = process.argv.includes("--passes");

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // src/lib/tap-card/card-code.ts
function newCode() {
  let code = "";
  for (const byte of crypto.randomBytes(8)) code += CODE_ALPHABET[byte & 31];
  return code;
}
const printed = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** The demo cast. Throws if a "Sample " member isn't a draft: it could be on the live site. */
async function cast() {
  const rows = must(
    await db.from("members").select("id, business_name, slug, member_type, status, trail_eligible").ilike("business_name", "sample %").order("business_name"),
    "members",
  );
  const live = rows.filter((m) => m.status !== "draft");
  if (live.length) throw new Error(`Refusing: not draft (would be public): ${live.map((m) => `${m.business_name} (${m.status})`).join(", ")}`);
  if (!rows.length) throw new Error('No draft members named "Sample …" found.');
  return rows.map((m) => ({ ...m, trailStop: m.member_type === "producer" && m.trail_eligible === true }));
}

const label = (m) => `${m.business_name} — ${m.member_type}${m.trailStop ? ", Beer Trail stop" : ""}`;

async function plates(ids) {
  const rows = must(await db.from("tap_card_plates").select("member_id, code, staff_code, staff_qr").in("member_id", ids), "plates");
  return Object.fromEntries(rows.map((p) => [p.member_id, p]));
}

async function liveRewards(ids) {
  const rows = must(
    await db.from("tap_card_member_offers").select("member_id, slot, live_visit_number, live_reward, draft_status").in("member_id", ids),
    "rewards",
  );
  const by = {};
  for (const r of rows) (by[r.member_id] ??= []).push(r);
  return by;
}

function rewardLine(r) {
  if (!r.live_reward) return `${r.slot}: (waiting for approval)`;
  return r.slot === "repeat" ? `every ${r.live_visit_number} visits: ${r.live_reward}` : `visit ${r.live_visit_number}: ${r.live_reward}`;
}

/** Customers whose Scan Pass activity is ONLY at the Sample members (so deleting them touches nobody real). */
async function demoData(ids) {
  const visits = must(await db.from("tap_card_visits").select("id, holder_id").in("member_id", ids), "visits");
  const earned = must(await db.from("tap_card_earned_rewards").select("id, holder_id").in("member_id", ids), "earned rewards");
  const subs = must(await db.from("tap_card_member_subscribers").select("holder_id").in("member_id", ids), "subscribers");
  const joins = must(await db.from("tap_card_trail_joins").select("id, email_lower").in("member_id", ids), "sign-ups");
  const passes = must(await db.from("tap_card_trail_passes").select("id, holder_id, year, amount_cents").in("member_id", ids), "passes");
  const misses = must(await db.from("tap_card_plate_misses").select("id").in("member_id", ids), "staff-code misses");

  const touched = new Set([...visits, ...earned, ...subs, ...passes].map((r) => r.holder_id).filter(Boolean));
  // Holders who signed up at a Sample plate (free pass or Beer Trail join) by email.
  const joinEmails = [...new Set(joins.map((j) => j.email_lower))];
  if (joinEmails.length) {
    for (const h of must(await db.from("tap_card_holders").select("id").in("email_lower", joinEmails), "holders by email")) touched.add(h.id);
  }
  for (const h of must(await db.from("tap_card_holders").select("id").in("activated_by_member_id", ids), "holders by member")) touched.add(h.id);

  const demoHolders = [];
  const realHolders = [];
  for (const id of touched) {
    const elsewhereVisits = must(await db.from("tap_card_visits").select("id").eq("holder_id", id).not("member_id", "in", `(${ids.join(",")})`).limit(1), "other visits");
    const elsewherePasses = must(await db.from("tap_card_trail_passes").select("id").eq("holder_id", id).not("member_id", "in", `(${ids.join(",")})`).limit(1), "other passes");
    (elsewhereVisits.length || elsewherePasses.length ? realHolders : demoHolders).push(id);
  }
  return { visits, earned, subs, joins, passes, misses, demoHolders, realHolders };
}

async function status() {
  const members = await cast();
  const ids = members.map((m) => m.id);
  const [p, rewards, data] = await Promise.all([plates(ids), liveRewards(ids), demoData(ids)]);
  console.log("Demo cast (draft, names start with \"Sample \"):");
  for (const m of members) {
    const plate = p[m.id];
    const state = !plate ? "no plate yet" : plate.staff_code ? `plate ON (staff code ${plate.staff_code})` : "plate OFF (no staff code)";
    console.log(`  ${label(m)}\n    ${state}`);
    for (const r of rewards[m.id] ?? []) console.log(`    reward ${rewardLine(r)}`);
  }
  const milestones = must(await db.from("tap_card_milestones").select("stops_required, reward_text").eq("active", true), "milestones");
  const campaigns = must(await db.from("tap_card_trail_campaigns").select("year, unlock_now"), "campaigns");
  console.log(`\nGuild milestones (active): ${milestones.length ? milestones.map((x) => `${x.stops_required} stops: ${x.reward_text}`).join("; ") : "none"}`);
  console.log(`Beer Trail campaigns: ${campaigns.map((c) => `${c.year}${c.unlock_now ? " (Testing: offers work now — ON)" : ""}`).join(", ") || "none"}`);
  console.log(
    `\nDemo data at the Sample members: ${data.visits.length} visits, ${data.earned.length} earned rewards, ${data.passes.length} Beer Trail Passes, ` +
      `${data.joins.length} sign-ups, ${data.subs.length} email opt-ins, ${data.demoHolders.length} demo customers` +
      (data.realHolders.length ? ` (+${data.realHolders.length} customers also active elsewhere — never deleted)` : ""),
  );
}

async function setup() {
  const members = await cast();
  const ids = members.map((m) => m.id);
  const p = await plates(ids);
  const rewards = await liveRewards(ids);
  const steps = [];
  for (const m of members) {
    const plate = p[m.id];
    if (!plate) steps.push({ say: `${m.business_name}: make plate + staff QR, staff code ${DEMO_STAFF_CODE}`, run: () => db.from("tap_card_plates").insert({ member_id: m.id, code: newCode(), staff_qr: newCode(), staff_code: DEMO_STAFF_CODE }) });
    else {
      if (!plate.staff_qr) steps.push({ say: `${m.business_name}: add a staff QR`, run: () => db.from("tap_card_plates").update({ staff_qr: newCode() }).eq("member_id", m.id) });
      if (plate.staff_code !== DEMO_STAFF_CODE)
        steps.push({ say: `${m.business_name}: staff code ${plate.staff_code ?? "(none)"} → ${DEMO_STAFF_CODE}`, run: () => db.from("tap_card_plates").update({ staff_code: DEMO_STAFF_CODE, updated_at: new Date().toISOString() }).eq("member_id", m.id) });
    }
    const wanted = DEMO_REWARDS[m.slug];
    if (!wanted) continue;
    if (!m.trailStop && wanted.some((r) => r.slot !== "repeat" && r.visitNumber < 1)) throw new Error(`${m.business_name}: bad visit number`);
    if (m.trailStop && wanted.some((r) => r.slot !== "repeat" && r.visitNumber < 2)) throw new Error(`${m.business_name} is a trail stop: steps start at visit 2`);
    const have = rewards[m.id] ?? [];
    if (have.length) {
      console.log(`  ${m.business_name}: already has rewards — left as they are`);
      continue;
    }
    for (const r of wanted) {
      steps.push({
        say: `${m.business_name}: approved reward ${r.slot === "repeat" ? `every ${r.visitNumber} visits` : `visit ${r.visitNumber}`}: ${r.reward}`,
        run: () =>
          db.from("tap_card_member_offers").insert({
            member_id: m.id,
            slot: r.slot,
            live_visit_number: r.visitNumber,
            live_reward: r.reward,
            live_terms: r.terms,
            live_approved_at: new Date().toISOString(),
          }),
      });
    }
  }
  await runSteps(steps);
}

async function reset() {
  const members = await cast();
  const ids = members.map((m) => m.id);
  const data = await demoData(ids);
  const steps = [];
  // Earned rewards go with their visit (cascade), but delete them first anyway: a reward row never outlives the reset.
  if (data.earned.length) steps.push({ say: `delete ${data.earned.length} earned rewards at the Sample members`, run: () => db.from("tap_card_earned_rewards").delete().in("member_id", ids) });
  if (data.visits.length) steps.push({ say: `delete ${data.visits.length} visits at the Sample members (Beer Trail offers can be used again)`, run: () => db.from("tap_card_visits").delete().in("member_id", ids) });
  if (data.misses.length) steps.push({ say: `clear ${data.misses.length} staff-code misses`, run: () => db.from("tap_card_plate_misses").delete().in("member_id", ids) });
  if (data.demoHolders.length) {
    const year = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).slice(0, 4));
    steps.push({
      say: `delete Guild milestone rewards of ${data.demoHolders.length} demo customers`,
      run: () => db.from("tap_card_rewards").delete().in("holder_id", data.demoHolders).gte("year", year),
    });
  }
  return steps;
}

async function teardown() {
  const steps = await reset();
  const members = await cast();
  const ids = members.map((m) => m.id);
  const data = await demoData(ids);
  if (data.subs.length) steps.push({ say: `delete ${data.subs.length} email opt-ins at the Sample members`, run: () => db.from("tap_card_member_subscribers").delete().in("member_id", ids) });
  if (data.joins.length) steps.push({ say: `delete ${data.joins.length} Beer Trail sign-ups at the Sample members`, run: () => db.from("tap_card_trail_joins").delete().in("member_id", ids) });
  if (data.passes.length) {
    if (withPasses) steps.push({ say: `delete ${data.passes.length} Beer Trail Passes credited to the Sample members`, run: () => db.from("tap_card_trail_passes").delete().in("member_id", ids) });
    else console.log(`  keeping ${data.passes.length} Beer Trail Passes credited to the Samples (add --passes to delete them)`);
  }
  if (data.demoHolders.length) {
    if (data.passes.length && !withPasses) console.log("  keeping the demo customers too, so their passes keep working (add --passes)");
    else steps.push({ say: `delete ${data.demoHolders.length} demo customers (their sign-in sessions end)`, run: () => db.from("tap_card_holders").delete().in("id", data.demoHolders) });
  }
  if (data.realHolders.length) console.log(`  never touching ${data.realHolders.length} customers who are also active at real members`);
  return steps;
}

async function runSteps(steps) {
  if (!steps.length) {
    console.log("Nothing to do.");
    return;
  }
  for (const s of steps) console.log(`  ${apply ? "✓" : "would"} ${s.say}`);
  if (!apply) {
    console.log("\nNothing changed. Run again with --yes to do it.");
    return;
  }
  for (const s of steps) {
    const { error } = await s.run();
    if (error) throw new Error(`${s.say}: ${error.message}`);
  }
  console.log("Done.");
}

async function print() {
  const members = await cast();
  const p = await plates(members.map((m) => m.id));
  const missing = members.filter((m) => !p[m.id]?.staff_qr);
  if (missing.length) throw new Error(`Run setup first: no plate for ${missing.map((m) => m.business_name).join(", ")}`);
  const qr = (url) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  let cards = "";
  for (const m of members) {
    const plate = p[m.id];
    const plateSvg = await qr(`${STAGING_SITE}/t/${plate.code}`);
    const staffSvg = await qr(`${STAGING_SITE}/s/${plate.staff_qr}`);
    const tag = m.trailStop ? "Beer Trail stop" : m.member_type === "mobile" ? "Food truck · loyalty only" : "Loyalty only (not on the trail)";
    cards += `
<section class="pair">
  <div class="card plate">
    <div class="eb">Inland Scan Pass</div>
    <div class="name">${m.business_name}</div>
    <div class="tag">${tag}</div>
    <div class="qr">${plateSvg}</div>
    <div class="cta">Scan to check in</div>
    <div class="code">Counter plate · ${printed(plate.code)}</div>
  </div>
  <div class="card staff">
    <div class="eb">Staff only · keep behind the counter</div>
    <div class="name">${m.business_name}</div>
    <div class="qr">${staffSvg}</div>
    <div class="cta">Staff QR code</div>
    <div class="code">${printed(plate.staff_qr)} · staff code ${plate.staff_code ?? "—"}</div>
  </div>
</section>`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Scan Pass demo kit — print sheet</title>
<style>
  @page { size: letter; margin: 0.5in; }
  body { font-family: system-ui, sans-serif; color: #241F1A; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4pt; } p.note { font-size: 9pt; color: #6B6156; margin: 0 0 12pt; }
  .pair { display: flex; gap: 0.3in; break-inside: avoid; margin-bottom: 0.3in; }
  .card { flex: 1; border: 2px dashed #B6AC9D; border-radius: 12px; padding: 14pt; text-align: center; }
  .plate { border-color: #E8913A; }
  .eb { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; color: #B3591F; font-weight: 700; }
  .staff .eb { color: #6B6156; }
  .name { font-size: 18pt; font-weight: 800; margin-top: 4pt; }
  .tag { font-size: 9pt; color: #6B6156; margin-top: 2pt; }
  .qr svg { width: 2.4in; height: 2.4in; margin: 8pt auto 4pt; display: block; }
  .cta { font-size: 13pt; font-weight: 700; }
  .code { font: 600 10pt ui-monospace, Consolas, monospace; color: #6B6156; margin-top: 4pt; }
</style></head><body>
<h1>Scan Pass demo kit — counter plates and staff QR codes</h1>
<p class="note">Demo members only (drafts). These codes point at the STAGING site, the only place draft members take check-ins. Cut along the dashed lines; keep each staff QR away from its plate.</p>
${cards}
</body></html>`;
  fs.mkdirSync(PRINT_DIR, { recursive: true });
  const out = path.join(PRINT_DIR, "print-sheet.html");
  fs.writeFileSync(out, html);
  console.log(`Wrote ${out} — open it in Chrome and print (Letter, scale 100%).`);
}

try {
  if (command === "status") await status();
  else if (command === "setup") await setup();
  else if (command === "print") await print();
  else if (command === "reset") await runSteps(await reset());
  else if (command === "teardown") await runSteps(await teardown());
  else throw new Error(`Unknown command "${command}". Use status, setup, print, reset or teardown.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
