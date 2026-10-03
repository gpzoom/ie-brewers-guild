// Sample members for the member guide's screenshots (wizard redesign, plan
// Task 11). Creates -- or, run again, recreates -- three NEVER-PUBLISHED
// members with clean sample data: Sample Brewing Co. (producer), Sample Taco
// Truck (mobile) and Sample Supply Co. (allied). Status stays 'draft', so
// they never appear on the directory, the map or the homepage carousel,
// which all read published members only. The database is shared with the
// live site; nothing else is touched.
//
//   node scripts/sample-members.mjs            create or refresh all three
//   node scripts/sample-members.mjs --setup=fresh   type unconfirmed, setup not done (Welcome / Confirm type shots)
//   node scripts/sample-members.mjs --setup=done    type confirmed, setup done (every other step)
//
// Reads the service key from .dev.vars and never prints it. No emails are sent.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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
const db = createClient(vars.VITE_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ASSETS = "scripts/sample-assets";
const setupArg = (process.argv.find((a) => a.startsWith("--setup=")) ?? "").split("=")[1];

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/** A local date N days from today, YYYY-MM-DD, and an ISO time at hh:mm Pacific on it. */
function day(offset) {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
function at(offset, hhmm) {
  // Pacific is UTC-7 in October.
  return new Date(`${day(offset)}T${hhmm}:00-07:00`).toISOString();
}

const SAMPLES = [
  {
    slug: "sample-brewing-co",
    email: "boblelle77+sample-producer@gmail.com",
    member: {
      member_type: "producer",
      business_name: "Sample Brewing Co.",
      tagline: "Small-batch ales and lagers, brewed in downtown Riverside.",
      street_address: "3750 Main Street",
      city: "Riverside",
      state: "CA",
      postal_code: "92501",
      phone: "(951) 555-0142",
      member_since_year: 2019,
      theme: "amber",
      logo_background: "light",
    },
    // weekday 0 = Sunday. Monday closed.
    hours: [
      [1, null, null, true],
      [2, "15:00", "21:00"],
      [3, "15:00", "21:00"],
      [4, "15:00", "21:00"],
      [5, "14:00", "22:00"],
      [6, "12:00", "22:00"],
      [0, "12:00", "20:00"],
    ],
    links: [
      ["website", "https://samplebrewing.example"],
      ["instagram", "https://instagram.com/samplebrewing"],
      ["facebook", "https://facebook.com/samplebrewing"],
      ["taplist", "https://untappd.com/v/sample-brewing"],
    ],
    photos: ["brewhouse", "taproom", "brewer", "cheers", "festival"],
    slides: ["taproom", "brewer", "cheers"],
    cover: "brewhouse",
    logo: "sample-brewing-logo.png",
    events: [
      [8, "12:00", "22:00", "Oktoberfest on the patio"],
      [11, "19:00", "21:00", "Trivia night"],
      [14, "15:00", "21:00", "Fresh Hop IPA release"],
    ],
    categories: [],
  },
  {
    slug: "sample-taco-truck",
    email: "boblelle77+sample-mobile@gmail.com",
    member: {
      member_type: "mobile",
      business_name: "Sample Taco Truck",
      tagline: "Street tacos and aguas frescas, parked at your favorite taproom.",
      city: "Riverside",
      state: "CA",
      service_area: "Inland Empire and Coachella Valley",
      phone: "(951) 555-0188",
      member_since_year: 2022,
      theme: "teal",
      logo_background: "light",
    },
    hours: [],
    links: [
      ["website", "https://sampletacotruck.example"],
      ["instagram", "https://instagram.com/sampletacotruck"],
      ["instagram_dm", "https://ig.me/m/sampletacotruck"],
      ["press_kit", "https://sampletacotruck.example/press"],
    ],
    photos: [],
    slides: [],
    events: [
      [7, "17:00", "21:00", "Sample Brewing Co.", "Riverside"],
      [8, "16:00", "22:00", "Riverside Food Truck Night", "Riverside"],
      [13, "18:00", "21:00", "Private catering", "Corona"],
    ],
    categories: ["Food Truck"],
  },
  {
    slug: "sample-supply-co",
    email: "boblelle77+sample-allied@gmail.com",
    member: {
      member_type: "allied",
      business_name: "Sample Supply Co.",
      tagline: "Malt, hops and brewing supplies for Inland Empire brewers.",
      street_address: "1200 East Airport Drive",
      city: "Ontario",
      state: "CA",
      postal_code: "91761",
      service_area: "Southern California",
      phone: "(909) 555-0170",
      contact_email: "sales@samplesupply.example",
      member_since_year: 2017,
      theme: "indigo",
      logo_background: "light",
      discount_percent: 10,
      discount_redeem_text: "Call us and confirm you're a Guild Member in good standing.",
    },
    hours: [
      [1, "09:00", "17:00"],
      [2, "09:00", "17:00"],
      [3, "09:00", "17:00"],
      [4, "09:00", "17:00"],
      [5, "09:00", "17:00"],
      [6, null, null, true],
      [0, null, null, true],
    ],
    links: [
      ["website", "https://samplesupply.example"],
      ["catalog", "https://samplesupply.example/catalog"],
    ],
    photos: [],
    slides: [],
    events: [
      [12, "10:00", "14:00", "Fall malt tasting for brewers"],
      [22, "09:00", "13:00", "Homebrew supply open house"],
    ],
    categories: ["Malt & grain", "Ingredients", "Supplies"],
  },
];

async function ensureUser(email) {
  const list = must(await db.auth.admin.listUsers({ page: 1, perPage: 1000 }), "list users");
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;
  const created = must(await db.auth.admin.createUser({ email, email_confirm: true }), `create ${email}`);
  return created.user.id;
}

async function upload(bucket, memberId, file, mime) {
  const bytes = fs.readFileSync(path.join(ASSETS, file));
  const storagePath = `${memberId}/${bucket === "member-logos" ? "logo-" : ""}${crypto.randomUUID()}-${file}`;
  must(await db.storage.from(bucket).upload(storagePath, bytes, { contentType: mime, upsert: true }), `upload ${file}`);
  const row = must(
    await db
      .from("media_assets")
      .insert({
        member_id: memberId,
        storage_path: storagePath,
        kind: "image",
        mime_type: mime,
        byte_size: bytes.byteLength,
        original_filename: file,
        source: "member_upload",
        review_status: "approved",
      })
      .select("id")
      .single(),
    `asset ${file}`,
  );
  return row.id;
}

async function removeExisting(slug) {
  const existing = must(await db.from("members").select("id, status").eq("slug", slug).maybeSingle(), "find");
  if (!existing) return;
  if (existing.status === "published") throw new Error(`${slug} is published -- refusing to touch it.`);
  for (const bucket of ["member-media", "member-logos"]) {
    const files = must(await db.storage.from(bucket).list(existing.id, { limit: 100 }), "list files");
    if (files.length) await db.storage.from(bucket).remove(files.map((f) => `${existing.id}/${f.name}`));
  }
  must(await db.from("members").delete().eq("id", existing.id), `delete ${slug}`);
}

async function create(sample) {
  await removeExisting(sample.slug);
  const userId = await ensureUser(sample.email);
  const member = must(
    await db
      .from("members")
      .insert({ slug: sample.slug, status: "draft", timezone: "America/Los_Angeles", ...sample.member })
      .select("id")
      .single(),
    `member ${sample.slug}`,
  );
  const id = member.id;
  must(await db.from("member_users").insert({ member_id: id, user_id: userId, role: "owner" }), "owner");

  if (sample.hours.length) {
    must(
      await db.from("hours").insert(
        sample.hours.map(([weekday, opens, closes, closed]) => ({
          member_id: id,
          weekday,
          opens_at: opens ?? "12:00",
          closes_at: closes ?? "20:00",
          closes_next_day: false,
          is_closed: closed === true,
        })),
      ),
      "hours",
    );
    must(
      await db.from("special_hours").insert({
        member_id: id,
        date: `${new Date().getFullYear()}-12-25`,
        is_closed: true,
        note: "Closed for Christmas Day",
      }),
      "christmas",
    );
  }
  must(
    await db.from("member_links").insert(
      sample.links.map(([kind, url], i) => ({ member_id: id, kind, label: null, url, sort_order: i })),
    ),
    "links",
  );

  const assetIds = {};
  for (const p of sample.photos) assetIds[p] = await upload("member-media", id, `${p}.jpg`, "image/jpeg");
  const patch = {};
  if (sample.logo) patch.logo_asset_id = await upload("member-logos", id, sample.logo, "image/png");
  if (sample.cover) patch.cover_asset_id = assetIds[sample.cover];
  if (Object.keys(patch).length) must(await db.from("members").update(patch).eq("id", id), "logo/cover");
  if (sample.slides.length) {
    must(
      await db.from("carousel_slides").insert(
        sample.slides.map((p, i) => ({
          member_id: id,
          asset_id: assetIds[p],
          crop: { x: 0.2, y: 0, w: 0.5, h: 1 },
          outbound_url: null,
          sort_order: i,
        })),
      ),
      "slides",
    );
  }

  if (sample.categories.length) {
    const cats = must(await db.from("categories").select("id, name").in("name", sample.categories), "categories");
    must(await db.from("member_categories").insert(cats.map((c) => ({ member_id: id, category_id: c.id }))), "member cats");
  }

  must(
    await db.from("events").insert(
      sample.events.map(([offset, start, end, title, city]) => ({
        member_id: id,
        source: "manual",
        kind: "event",
        title,
        starts_at: at(offset, start),
        ends_at: at(offset, end),
        city: city ?? null,
      })),
    ),
    "events",
  );
  console.log(`created ${sample.slug} (draft, never published)`);
  return id;
}

async function setSetup(mode) {
  // type_confirmed_at / setup_completed_at are guarded by a trigger: only
  // their own functions (app.member_fn = 'on') may change them. These are
  // sample members, so set the flag inside one transaction, as the function
  // would, through the linked database.
  const value = mode === "done" ? "now()" : "null";
  const slugs = SAMPLES.map((s) => `'${s.slug}'`).join(", ");
  const sql =
    "begin; select set_config('app.member_fn', 'on', true); " +
    `update public.members set type_confirmed_at = ${value}, setup_completed_at = ${value} ` +
    `where slug in (${slugs}) and status <> 'published'; commit;`;
  // Through a file: passing the SQL as an argument breaks on Windows quoting.
  const file = path.join(os.tmpdir(), `sample-setup-${Date.now()}.sql`);
  fs.writeFileSync(file, sql);
  try {
    execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", JSON.stringify(file)], { stdio: "ignore", shell: true });
  } finally {
    fs.rmSync(file, { force: true });
  }
  console.log(`setup ${mode} for the sample members`);
}

if (setupArg) {
  await setSetup(setupArg);
} else {
  for (const s of SAMPLES) await create(s);
}
const check = must(await db.from("members").select("slug, status").in("slug", SAMPLES.map((s) => s.slug)), "check");
console.log(check.map((m) => `${m.slug}: ${m.status}`).join("\n"));
