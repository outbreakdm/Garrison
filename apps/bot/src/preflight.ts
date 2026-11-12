import { inviteUrl } from "@garrison/brand";
import { createDb, describeDbRole, probeTable, roleProblem } from "@garrison/db";
import { loadEnv } from "./env.js";

/**
 * `pnpm preflight`: check everything Garrison needs before it goes live, and
 * say exactly what to fix. Read-only: it changes nothing in Discord or the
 * database. Exits non-zero if anything required is wrong.
 */

const API = process.env.DISCORD_API_BASE || "https://discord.com/api/v10";
let failed = false;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);
const fail = (msg: string) => {
  failed = true;
  console.log(`  ✗ ${msg}`);
};

// Application flags: https://discord.com/developers/docs/resources/application#application-object-application-flags
const FLAG = {
  members: (1 << 14) | (1 << 15),
  messageContent: (1 << 18) | (1 << 19),
};

async function discord<T>(
  path: string,
  token: string,
): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, body: res.ok ? ((await res.json()) as T) : null };
}

async function checkDiscord(token: string, clientId: string) {
  console.log("Discord");
  try {
    const me = await discord<{ id: string; username: string; bot?: boolean }>("/users/@me", token);
    if (me.status === 401) return fail("DISCORD_TOKEN was rejected. Reset it under Bot → Token.");
    if (!me.body?.bot) return fail(`Discord answered ${me.status}. Check DISCORD_TOKEN.`);
    ok(`Token works: signed in as ${me.body.username}`);
    if (me.body.id !== clientId)
      fail(`DISCORD_CLIENT_ID (${clientId}) isn't this bot's application (${me.body.id}).`);
    else ok("DISCORD_CLIENT_ID matches the token");

    const app = await discord<{ flags?: number; bot_public?: boolean }>("/applications/@me", token);
    const flags = app.body?.flags ?? 0;
    if (flags & FLAG.members) ok("Server Members Intent is on");
    else fail("Server Members Intent is off. Turn it on under Bot → Privileged Gateway Intents.");
    if (flags & FLAG.messageContent)
      ok("Message Content Intent is on (Garrison asks for it only once automod is enabled)");
    else warn("Message Content Intent is off. Fine for now; automod will need it.");
    if (app.body?.bot_public)
      warn(
        "Public Bot is on: anyone with the invite link can add Garrison. Turn it off while testing.",
      );
    console.log(`  → Invite link: ${inviteUrl(clientId)}`);
  } catch (error) {
    fail(`Couldn't reach Discord (${(error as Error).message}). Check the host's network.`);
  }
}

async function checkDb(label: string, url: string, role: string, tables: string[]) {
  console.log(label);
  const { db, close } = createDb(url, { max: 1 });
  try {
    const problem = roleProblem(await describeDbRole(db), role);
    if (problem) fail(problem);
    else ok(`Connected as ${role}`);
    for (const table of tables) {
      try {
        await probeTable(db, table);
      } catch (error) {
        const msg = String((error as { cause?: Error }).cause?.message ?? (error as Error).message);
        if (/does not exist/.test(msg)) {
          fail(`Table ${table} is missing: run the migrations (pnpm db:migrate).`);
          return;
        }
        if (/permission denied/.test(msg)) {
          fail(`${role} can't read ${table}: run the migrations so its grants exist.`);
          return;
        }
        throw error;
      }
    }
    ok("Schema is up to date");
  } catch (error) {
    const msg = String((error as { cause?: Error }).cause?.message ?? (error as Error).message);
    if (/password authentication failed|Tenant or user not found/i.test(msg))
      fail(
        `${role} couldn't log in. Check the password and that the user is ${role}.<project-ref>.`,
      );
    else if (/cannot login|not permitted to log in/i.test(msg))
      fail(`${role} can't log in yet. Run the ALTER ROLE step in DEPLOY.md.`);
    else fail(`Couldn't connect: ${msg}`);
  } finally {
    await close();
  }
}

console.log("Garrison preflight\n");
let env: ReturnType<typeof loadEnv> | undefined;
try {
  env = loadEnv();
  ok("Bot environment is complete");
} catch (error) {
  fail((error as Error).message);
}
if (env) {
  // Newest tables first: if these exist with grants, everything older does too.
  const latest = ["rally_settings", "guild_plans", "dashboard_actions", "guilds"];
  await checkDiscord(env.DISCORD_TOKEN, env.DISCORD_CLIENT_ID);
  await checkDb("Database (bot)", env.DATABASE_URL, "garrison_bot", latest);
  if (process.env.WEB_DATABASE_URL)
    // platform_staff (0022) is the dashboard's newest table; the bot has no grant on it.
    await checkDb("Database (dashboard)", process.env.WEB_DATABASE_URL, "garrison_web", [
      "platform_staff",
      ...latest,
    ]);
  console.log("Dashboard");
  const app = process.env.APP_URL;
  if (!app) warn("APP_URL isn't set: the dashboard won't start.");
  else if (!app.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(app))
    fail("APP_URL must be https:// in production (session cookies require it).");
  else ok(`Dashboard URL ${app}; add ${app}/auth/callback under OAuth2 → Redirects`);
  if (!process.env.DISCORD_CLIENT_SECRET)
    warn("DISCORD_CLIENT_SECRET isn't set: dashboard sign-in won't work.");
  console.log("Optional");
  if (env.ANTHROPIC_API_KEY) ok("Quartermaster is on");
  else warn("ANTHROPIC_API_KEY isn't set: /qm build stays off.");
}
console.log(failed ? "\nFix the ✗ items, then run this again." : "\nAll set. Start Garrison.");
process.exit(failed ? 1 : 0);
