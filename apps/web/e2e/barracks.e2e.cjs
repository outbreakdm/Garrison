const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
// Usage: like e2e/README.md, plus BNET_CLIENT_ID/BNET_CLIENT_SECRET set on the server.
const S = process.env.E2E_OUT ?? __dirname;
const B = "http://localhost:3100";
const sql = (q) =>
  execSync(`psql -q -h 127.0.0.1 -p 55432 -U postgres -tA -c "${q}"`).toString().trim();
const res = [];
const check = (n, ok, d = "") => res.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` (${d})` : ""}`);
(async () => {
  const b = await chromium.launch();
  // Signed out first.
  const anon = await b.newContext();
  const ap = await anon.newPage();
  await ap.goto(`${B}/account`);
  check("account page needs sign-in", ap.url().includes("/login"), ap.url());
  const r = await (
    await anon.request.get(`${B}/auth/login?purpose=connections`, { maxRedirects: 0 })
  ).headers();
  check(
    "linking while signed out goes to sign-in, not Discord",
    (r.location ?? "").includes("/login"),
    r.location,
  );
  await anon.close();

  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.setExtraHTTPHeaders({
    Cookie: `__Host-garrison_session=${process.env.E2E_SESSION_TOKEN}`,
  });
  const p = await ctx.newPage();
  const csp = [];
  p.on("console", (m) => /Content Security Policy/.test(m.text()) && csp.push(m.text()));

  const link = await ctx.request.get(`${B}/auth/login?purpose=connections`, { maxRedirects: 0 });
  const loc = new URL(link.headers().location);
  check(
    "Discord linking asks for identify + connections only",
    loc.searchParams.get("scope") === "identify connections",
    loc.searchParams.get("scope"),
  );
  const normal = new URL(
    (await ctx.request.get(`${B}/auth/login`, { maxRedirects: 0 })).headers().location,
  );
  check(
    "ordinary sign-in never asks for connections",
    normal.searchParams.get("scope") === "identify guilds",
    normal.searchParams.get("scope"),
  );
  // Those calls set the OAuth cookie in the jar, which would replace the injected session header.
  await ctx.clearCookies();

  await p.goto(`${B}/account`);
  const rows = await p.$$eval(".g-table tbody tr", (trs) => trs.map((t) => t.textContent));
  check(
    "account page lists links with verified/claimed",
    rows.length === 2 &&
      rows.some((r) => r.includes("claimed")) &&
      rows.some((r) => r.includes("verified")),
    rows.join(" | "),
  );
  check(
    "WoW linking shown when Battle.net is configured",
    (await p.$("form[action='/auth/battlenet/login']")) !== null,
  );
  await p.screenshot({ path: `${S}/account.png`, fullPage: true });

  // Submitting the WoW form must reach Battle.net despite the CSP form-action rule.
  const [req] = await Promise.all([
    p
      .waitForRequest((r) => r.url().startsWith("https://oauth.battle.net/authorize"), {
        timeout: 8000,
      })
      .catch(() => null),
    p.click("text=Link WoW characters"),
  ]);
  check(
    "WoW form reaches oauth.battle.net",
    Boolean(req),
    req ? new URL(req.url()).searchParams.get("scope") : "blocked",
  );
  // Battle.net itself is unreachable from this sandbox; let that failed load finish first.
  await p.waitForLoadState("load").catch(() => {});
  await p.waitForTimeout(500);
  await ctx.clearCookies();
  await p.goto(`${B}/account`);

  // Forge a removal of someone else's link.
  const other = sql(
    "insert into linked_accounts (user_id, provider, account_id, display_name, verified, source) values ('999','steam','x','victim',true,'discord') returning id",
  );
  await p.$eval(
    "form input[name='linkId']",
    (el, v) => {
      el.value = v;
    },
    other,
  );
  await p.click("form:has(input[name='linkId']) button");
  await p.waitForURL(/error=invalid/);
  check(
    "can't remove another member's link",
    sql(`select removed_at is null from linked_accounts where id='${other}'`) === "t",
  );

  await p.goto(`${B}/account`);
  await p.click("form:has(input[name='linkId']) button");
  await p.waitForURL(/removed=1/);
  check(
    "removes own link",
    sql("select count(*) from linked_accounts where user_id='1' and removed_at is null") === "1",
  );

  await p.goto(`${B}/servers/111111111111111111/barracks`);
  const roster = await p.$$eval(".g-table tbody tr", (trs) => trs.map((t) => t.textContent));
  check("server roster shows shared accounts", roster.length >= 1, roster.join(" | "));
  await p.screenshot({ path: `${S}/barracks.png`, fullPage: true });

  await p.goto(`${B}/account`);
  await p.click("form:has(input[name='guildId'][value='222222222222222222']) button");
  await p.waitForURL(/unshared=1/);
  check(
    "stop sharing with a server",
    sql(
      "select removed_at is not null from roster_shares where guild_id='222222222222222222' and user_id='1'",
    ) === "t",
  );
  check("no CSP violations", csp.length === 0, csp.join(" ").slice(0, 160));
  await b.close();
  console.log(res.join("\n"));
  process.exitCode = res.some((r) => r.startsWith("FAIL")) ? 1 : 0;
})();
