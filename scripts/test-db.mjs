#!/usr/bin/env node
/**
 * Runs the pgTAP tests in supabase/tests/*.test.sql against the LINKED
 * Supabase project, without Docker (`supabase test db --linked` needs it).
 *
 * Staging and production share that one database, so every test file is a
 * single transaction that starts with `begin;` and ends with `rollback;` --
 * nothing a test does is ever committed. Each file is sent whole through
 * `supabase db query --linked -f`, which runs it on one connection and
 * returns the last result set: the file's final `select ... from _tap`,
 * i.e. the TAP output.
 *
 * Migrations in supabase/migrations/ that aren't applied to the linked
 * project yet are spliced in right after the file's `begin;`, so the tests
 * can check a migration before it's pushed -- still inside the same
 * rolled-back transaction. Once they're applied, nothing is spliced.
 *
 * `\ir <file>` lines (psql's include, used for the shared fixtures) are
 * inlined, since `db query` isn't psql.
 *
 * Usage:
 *   npm run test:db                                   # every *.test.sql
 *   npm run test:db -- supabase/tests/drafts_roles.test.sql
 *   npm run test:db -- --no-pending                    # never splice migrations
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(root, "supabase", "tests");
const migrationsDir = join(root, "supabase", "migrations");

const args = process.argv.slice(2);
const noPending = args.includes("--no-pending");
const fileArgs = args.filter((a) => !a.startsWith("--"));

function runQuery(sqlFile) {
  const result = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", `"${sqlFile}"`], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${result.stdout ?? ""}`;
  const jsonStart = out.indexOf("{");
  if (jsonStart === -1) {
    return { error: `${out}\n${result.stderr ?? ""}`.trim() || `exit code ${result.status}` };
  }
  try {
    const parsed = JSON.parse(out.slice(jsonStart));
    if (parsed.error || parsed._tag === "Error")
      return { error: JSON.stringify(parsed.error ?? parsed) };
    return { rows: parsed.rows ?? [] };
  } catch {
    return { error: out.slice(jsonStart) };
  }
}

function withTempSql(sql, fn) {
  const dir = mkdtempSync(join(tmpdir(), "test-db-"));
  const file = join(dir, "run.sql");
  writeFileSync(file, sql, "utf8");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function pendingMigrations() {
  const local = readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  const res = withTempSql(
    "select coalesce(string_agg(version, ',' order by version), '') as versions from supabase_migrations.schema_migrations;",
    runQuery,
  );
  if (res.error) throw new Error(`Couldn't read applied migrations: ${res.error}`);
  const applied = new Set(
    String(res.rows[0]?.versions ?? "")
      .split(",")
      .filter(Boolean),
  );
  return local.filter((f) => !applied.has(f.split("_")[0]));
}

function inlineIncludes(sql, baseDir) {
  return sql.replace(/^\\ir\s+(\S+)\s*$/gm, (_, rel) => {
    const path = join(baseDir, rel);
    return `-- >>> ${rel}\n${inlineIncludes(readFileSync(path, "utf8"), dirname(path))}\n-- <<< ${rel}`;
  });
}

function buildSql(testFile, pending) {
  let sql = inlineIncludes(readFileSync(testFile, "utf8"), dirname(testFile));
  if (!/^\s*rollback;\s*$/m.test(sql))
    throw new Error(`${basename(testFile)} must end with rollback;`);
  const begin = /^begin;\s*$/m;
  if (!begin.test(sql))
    throw new Error(`${basename(testFile)} must start its transaction with a line "begin;"`);
  if (pending.length > 0) {
    const migrationSql = pending
      .map(
        (f) => `-- >>> pending migration ${f}\n${readFileSync(join(migrationsDir, f), "utf8")}\n`,
      )
      .join("\n");
    sql = sql.replace(begin, () => `begin;\n${migrationSql}`);
  }
  return sql;
}

const testFiles =
  fileArgs.length > 0
    ? fileArgs.map((f) => resolve(root, f))
    : readdirSync(testsDir)
        .filter((f) => f.endsWith(".test.sql"))
        .sort()
        .map((f) => join(testsDir, f));

const pending = noPending ? [] : pendingMigrations();
if (pending.length > 0) {
  console.log(`# Splicing ${pending.length} unapplied migration(s) into each test transaction:`);
  for (const f of pending) console.log(`#   ${f}`);
}

let failedFiles = 0;
for (const testFile of testFiles) {
  const name = basename(testFile);
  console.log(`\n# ${name}`);
  const res = withTempSql(buildSql(testFile, pending), runQuery);
  if (res.error) {
    console.log(`not ok - ${name} aborted: ${res.error}`);
    failedFiles++;
    continue;
  }
  const lines = res.rows.map((r) => String(r.tap ?? Object.values(r)[0] ?? ""));
  for (const line of lines) console.log(line);
  const planLine = lines.find((l) => /^1\.\.\d+/.test(l));
  const planned = planLine ? Number(planLine.slice(3)) : NaN;
  const oks = lines.filter((l) => /^ok \d+/.test(l)).length;
  const notOks = lines.filter((l) => /^not ok \d+/.test(l)).length;
  const planFail = lines.some((l) => /^# Looks like/.test(l));
  const passed = notOks === 0 && !planFail && oks === planned;
  console.log(`# ${name}: ${passed ? "PASS" : "FAIL"} (${oks}/${planned} ok, ${notOks} not ok)`);
  if (!passed) failedFiles++;
}

console.log(`\n# ${testFiles.length - failedFiles}/${testFiles.length} test file(s) passed`);
process.exit(failedFiles === 0 ? 0 : 1);
