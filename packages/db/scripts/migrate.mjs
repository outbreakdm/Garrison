// pnpm db:migrate: apply the migrations this database doesn't have yet, one at
// a time, and say plainly what went wrong. Keeps drizzle's own record
// (drizzle.__drizzle_migrations, same hashes), so drizzle-kit agrees with it.
//
//   pnpm db:migrate                    apply what's missing
//   pnpm db:migrate --baseline 0020    for a database set up without that
//                                      record: note 0000-0020 as already
//                                      there, then apply the rest
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import postgres from "postgres";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const folder = resolve(pkg, "migrations");
const rootEnv = resolve(pkg, "../../.env");

/** The repo's .env, as saved by any editor (UTF-16 or a byte order mark included). Shell values win. */
function loadEnv(file) {
  if (!existsSync(file)) return;
  const bytes = readFileSync(file);
  const text =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.subarray(2).toString("utf16le")
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? Buffer.from(bytes.subarray(2)).swap16().toString("utf16le")
        : bytes.toString("utf8").replace(/^﻿/, "");
  for (const [key, value] of Object.entries(parseEnv(text))) process.env[key] ??= value;
}

function stop(...lines) {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

/** Plain words for the errors people actually hit connecting to Supabase. */
function explain(error) {
  const text = `${error.code ?? ""} ${error.message ?? error}`;
  if (/28P01|password authentication failed/i.test(text))
    return "Wrong password. Use the database password (Supabase → Project Settings → Database), not your Supabase login.";
  if (/Tenant or user not found/i.test(text))
    return "Supabase doesn't know that user. On the Session pooler the user is postgres.<project-ref>, e.g. postgres.pijtbyfnhdxhtyidgcda.";
  if (/ENOTFOUND|EAI_AGAIN/i.test(text))
    return "That host name doesn't resolve. Copy the Session pooler string again (Supabase → Connect → Session pooler).";
  if (/ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|CONNECT_TIMEOUT/i.test(text))
    return "Couldn't reach the database. The Direct connection needs IPv6, which many home networks lack: use the Session pooler string (port 5432).";
  if (/ECONNREFUSED/i.test(text))
    return "Nothing is listening at that host and port. Check the port is 5432.";
  if (/Invalid URL|ERR_INVALID_URL|URI malformed/i.test(text))
    return "The connection string isn't a valid URL. If the password has @ # / : ? or %, URL-encode them (@ is %40) or pick a password without them.";
  return null;
}

// Anything that goes wrong past this point, in plain words rather than a stack trace.
process.on("uncaughtException", (error) =>
  stop(
    explain(error) ?? "Something went wrong.",
    `Postgres said: ${error.message ?? error}`,
    error.code === "42501"
      ? "This login isn't allowed to change the database. Migrations need the admin login (user postgres.<project-ref>)."
      : "",
  ),
);

const fromShell = Boolean(process.env.DATABASE_MIGRATION_URL);
loadEnv(rootEnv);
// Only the admin string: DATABASE_URL is the bot's login, which can't change tables.
const url = process.env.DATABASE_MIGRATION_URL ?? "";
const source = fromShell
  ? "DATABASE_MIGRATION_URL set in this shell"
  : `DATABASE_MIGRATION_URL in ${rootEnv}`;
if (!url)
  stop(
    "DATABASE_MIGRATION_URL isn't set.",
    `Put it in ${rootEnv}, or set it in this shell first:`,
    "  PowerShell:  $env:DATABASE_MIGRATION_URL = 'postgresql://...'",
    "  macOS/Linux: export DATABASE_MIGRATION_URL='postgresql://...'",
    "Use the admin login: Supabase → Connect → Session pooler, user postgres.<project-ref>.",
    existsSync(`${rootEnv}.txt`) ? `Found ${rootEnv}.txt: rename it to .env.` : "",
  );
// The project ref, from a Supabase pooler user like garrison_web.abcd1234.
const ref =
  decodeURIComponent(url.split("://")[1]?.split(":")[0] ?? "").split(".")[1] ?? "<project-ref>";

// A password with @ or # breaks the URL in ways that read as a wrong host.
const afterScheme = url.split("://")[1] ?? "";
if ((afterScheme.split("/")[0].match(/@/g) ?? []).length > 1 || afterScheme.includes("#"))
  stop(
    "The password in DATABASE_MIGRATION_URL has a character that breaks the URL (@ or #).",
    "URL-encode it (@ is %40, # is %23), or reset the database password to letters and digits",
    "(Supabase → Project Settings → Database → Reset database password).",
  );

const args = process.argv.slice(2);
const baselineAt = args.indexOf("--baseline");
const baseline = baselineAt >= 0 ? (args[baselineAt + 1] ?? "") : null;

// Same list, order and hashes drizzle uses: sha256 of each file's text.
const journal = JSON.parse(readFileSync(resolve(folder, "meta/_journal.json"), "utf8"));
const migrations = journal.entries.map((e) => {
  const text = readFileSync(resolve(folder, `${e.tag}.sql`), "utf8");
  return {
    tag: e.tag,
    when: e.when,
    hash: createHash("sha256").update(text).digest("hex"),
    statements: text
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
    text,
  };
});

const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
let sql;
try {
  sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    connect_timeout: 20,
    // Supabase takes TLS; a sslmode in the URL still wins.
    ...(local || /[?&]sslmode=/.test(url) ? {} : { ssl: "require" }),
  });
  const [me] = await sql`select current_user as user, current_database() as db`;
  console.log(`Connected as ${me.user} to ${me.db}.`);
  // Garrison's own logins can use its data but not change its tables.
  const [{ owner, canAlter }] = await sql`
    select pg_get_userbyid(c.relowner) as owner,
           pg_has_role(current_user, c.relowner, 'MEMBER') as "canAlter"
    from (select to_regclass('public.guilds') as oid) g
    left join pg_class c on c.oid = g.oid`;
  if (/^garrison_/.test(me.user) || (owner && !canAlter))
    stop(
      `That's the wrong login: ${me.user} ${
        /^garrison_/.test(me.user)
          ? "is one of Garrison's own logins, which can use its data but not change its tables."
          : `can't change Garrison's tables (they belong to ${owner}).`
      }`,
      "Migrations need the admin login: Supabase → Connect → Session pooler, with",
      `user postgres.${ref} and your database password (not garrison_web or garrison_bot).`,
      `The string came from ${source}.`,
    );
} catch (error) {
  stop("Couldn't connect.", explain(error) ?? "", `Postgres said: ${error.message ?? error}`);
}

const [{ record, garrison }] = await sql`
  select to_regclass('drizzle.__drizzle_migrations') is not null as record,
         to_regclass('public.guilds') is not null as garrison`;
const done = record
  ? await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`
  : [];

async function ensureRecord() {
  await sql`create schema if not exists drizzle`;
  await sql`create table if not exists drizzle.__drizzle_migrations (
    id serial primary key, hash text not null, created_at bigint)`;
}

/** Does the database already have what this migration creates? null when it can't tell. */
async function present(m) {
  const checks = [];
  for (const s of m.statements) {
    let x = s.match(/^CREATE TABLE(?: IF NOT EXISTS)? "(\w+)"/);
    if (x) checks.push(sql`select to_regclass(${`public.${x[1]}`}) is not null as ok`);
    x = s.match(/^CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)? "(\w+)"/);
    if (x) checks.push(sql`select to_regclass(${`public.${x[1]}`}) is not null as ok`);
    x = s.match(/^CREATE TYPE "public"\."(\w+)"/);
    if (x) checks.push(sql`select to_regtype(${`public.${x[1]}`}) is not null as ok`);
    x = s.match(/^ALTER TYPE "public"\."(\w+)" ADD VALUE(?: IF NOT EXISTS)? '(\w+)'/);
    if (x)
      checks.push(sql`select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = ${x[1]} and e.enumlabel = ${x[2]}) as ok`);
    x = s.match(/^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/);
    if (x)
      checks.push(sql`select exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = ${x[1]} and column_name = ${x[2]}) as ok`);
  }
  if (!checks.length) return null;
  const results = await Promise.all(checks);
  return results.every(([r]) => r.ok);
}

// A database set up without drizzle's record: Garrison's tables, no history.
if (!done.length && garrison) {
  if (baseline === null) {
    let through = null;
    for (const m of migrations) {
      const p = await present(m);
      if (p === false) break;
      if (p) through = m.tag;
    }
    const at = through ? migrations.findIndex((m) => m.tag === through) : -1;
    const missing = migrations.slice(at + 1).map((m) => m.tag);
    await sql.end();
    stop(
      "This database already has Garrison's tables, but no record of which migrations made them",
      "(it was probably set up from Supabase's SQL editor or tools, not with this command).",
      through
        ? `Everything up to ${through} is there. Still missing: ${missing.join(", ") || "nothing"}.`
        : "Couldn't tell which migrations are there.",
      through
        ? `To record 0000-${through.slice(0, 4)} as done and apply the rest, run:\n\n  pnpm db:migrate --baseline ${through.slice(0, 4)}`
        : "",
    );
  }
  const upTo = migrations.findIndex((m) => m.tag.startsWith(baseline) && baseline.length >= 4);
  if (upTo < 0) stop(`--baseline needs a migration number, like --baseline 0020.`);
  const target = migrations[upTo];
  if ((await present(target)) === false)
    stop(`${target.tag} isn't in this database, so it can't be the baseline. Pick an earlier one.`);
  await ensureRecord();
  for (const m of migrations.slice(0, upTo + 1))
    await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.when})`;
  console.log(`Recorded ${migrations[0].tag} to ${target.tag} as already applied.`);
} else if (baseline !== null && done.length) {
  console.log("This database already has a migration record, so --baseline is ignored.");
}

// What drizzle would apply: everything newer than the newest recorded migration.
const last = (
  await sql`
  select coalesce(max(created_at), 0)::bigint as at from drizzle.__drizzle_migrations`.catch(() => [
    { at: 0 },
  ])
)[0].at;
const pending = migrations.filter((m) => m.when > Number(last));
if (!pending.length) {
  console.log(`Nothing to apply: the database has all ${migrations.length} migrations.`);
  await sql.end();
  process.exit(0);
}

await ensureRecord();
for (const m of pending) {
  try {
    await sql.begin(async (tx) => {
      for (const statement of m.statements) await tx.unsafe(statement);
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.when})`;
    });
    console.log(`Applied ${m.tag}`);
  } catch (error) {
    await sql.end();
    stop(
      `${m.tag} failed, so it and everything after it were not applied.`,
      `Postgres said: ${error.message}`,
      error.detail ? `Detail: ${error.detail}` : "",
      error.hint ? `Hint: ${error.hint}` : "",
    );
  }
}
await sql.end();
console.log("migrations applied successfully");
