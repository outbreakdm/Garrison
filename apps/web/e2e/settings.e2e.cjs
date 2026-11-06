const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
// Usage: see e2e/README.md. Screenshots go to E2E_OUT (default: this folder).
const S = process.env.E2E_OUT ?? __dirname;
const B = "http://localhost:3100";
const G = "111111111111111111";
const OTHER = "222222222222222222";
const PG = process.env.E2E_PSQL ?? "psql -h 127.0.0.1 -p 55432 -U postgres";
const sql = (q) => execSync(`${PG} -tA -c "${q}"`).toString().trim();
const results = [];
const check = (name, ok, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  // Chromium refuses to plant __Host- cookies from automation, so send it as a header.
  await ctx.setExtraHTTPHeaders({
    Cookie: `__Host-garrison_session=${process.env.E2E_SESSION_TOKEN}`,
  });
  const page = await ctx.newPage();
  const csp = [];
  page.on("console", (m) => /Content Security Policy/i.test(m.text()) && csp.push(m.text()));
  let actionId = null;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      actionId ??= r.headers()["next-action"];
  });

  // Live permission check: user is only a plain member of OTHER.
  const denied = await page.goto(`${B}/servers/${OTHER}/settings`);
  check("no Manage Server -> 404", denied.status() === 404, `status ${denied.status()}`);
  const bogus = await page.goto(`${B}/servers/not-a-snowflake/settings`);
  check("malformed server id -> 404", bogus.status() === 404);

  const ok = await page.goto(`${B}/servers/${G}/settings`);
  check("settings page loads for a manager", ok.status() === 200);
  const options = await page.$$eval("#logChannelId option", (o) => o.map((x) => x.textContent));
  check(
    "channel picker lists only text channels",
    JSON.stringify(options) === JSON.stringify(["Don't log cases", "#general", "#mod-log"]),
    options.join(", "),
  );

  // 1. A normal save.
  await page.selectOption("#logChannelId", "300000000000000002");
  await page.uncheck('input[name="dmMembers"]');
  await page.click("text=Save Watch");
  await page.waitForURL(/saved=watch/);
  check(
    "save Watch",
    sql(`select log_channel_id || '/' || dm_members from watch_settings where guild_id='${G}'`) ===
      "300000000000000002/false",
  );
  check(
    "history row written",
    sql(
      `select username from settings_changes where guild_id='${G}' order by created_at desc limit 1`,
    ) === "taner",
  );
  await page.screenshot({ path: `${S}/settings.png`, fullPage: true });

  // 2. Forge the hidden guildId to a server the user can't manage.
  await page.goto(`${B}/servers/${G}/settings`);
  const otherBefore = sql(`select dm_members from watch_settings where guild_id='${OTHER}'`);
  await page.$eval(
    'form:has(#logChannelId) input[name="guildId"]',
    (el, v) => {
      el.value = v;
    },
    OTHER,
  );
  await page.uncheck('input[name="dmMembers"]');
  await page.click("text=Save Watch");
  await page.waitForLoadState("networkidle");
  check(
    "forged guildId is refused",
    sql(`select dm_members from watch_settings where guild_id='${OTHER}'`) === otherBefore &&
      !page.url().includes("saved="),
    page.url(),
  );

  // 3. Smuggle anti-nuke fields into the Gatehouse form.
  await page.goto(`${B}/servers/${G}/settings`);
  await page.$eval("form:has(#raidJoinCount)", (f) => {
    for (const [n, v] of [
      ["antiNukeEnabled", ""],
      ["antiNukeTrustedIds", "666666666666666666"],
    ]) {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = n;
      i.value = v;
      f.appendChild(i);
    }
  });
  await page.fill("#raidJoinCount", "6");
  await page.click("text=Save Gatehouse");
  await page.waitForURL(/saved=gatehouse/);
  check(
    "smuggled anti-nuke fields ignored",
    sql(
      `select anti_nuke_enabled || '/' || array_length(anti_nuke_trusted_ids,1) is null || '/' || raid_join_count from gatehouse_settings where guild_id='${G}'`,
    ) === "true/true/6" ||
      sql(
        `select anti_nuke_enabled::text || ',' || coalesce(array_length(anti_nuke_trusted_ids,1),0) || ',' || raid_join_count from gatehouse_settings where guild_id='${G}'`,
      ) === "true,0,6",
    sql(
      `select anti_nuke_enabled::text || ',' || coalesce(array_length(anti_nuke_trusted_ids,1),0) || ',' || raid_join_count from gatehouse_settings where guild_id='${G}'`,
    ),
  );

  // 4. A channel from outside the picker (the voice channel).
  await page.goto(`${B}/servers/${G}/settings`);
  await page.$eval("#alertChannelId", (s) => {
    const o = document.createElement("option");
    o.value = "300000000000000003";
    s.appendChild(o);
    s.value = o.value;
  });
  await page.click("text=Save Gatehouse");
  await page.waitForURL(/error=channel/);
  check(
    "non-text channel refused",
    sql(
      `select coalesce(alert_channel_id,'none') from gatehouse_settings where guild_id='${G}'`,
    ) === "none",
  );

  // 5. Out-of-range number, bypassing the browser's min/max.
  await page.goto(`${B}/servers/${G}/settings`);
  await page.$eval("#raidJoinCount", (i) => {
    i.removeAttribute("min");
    i.value = "1";
  });
  await page.click("text=Save Gatehouse");
  await page.waitForURL(/error=invalid/);
  check(
    "out-of-range value refused",
    sql(`select raid_join_count from gatehouse_settings where guild_id='${G}'`) === "6",
  );

  // 6. Undo the Watch change.
  await page.goto(`${B}/servers/${G}/settings`);
  const watchChange = sql(
    `select id from settings_changes where guild_id='${G}' and module='watch' order by created_at limit 1`,
  );
  await page.click(`form:has(input[value="${watchChange}"]) button`);
  await page.waitForURL(/saved=undo/);
  check(
    "undo restores the old values",
    sql(
      `select coalesce(log_channel_id,'none') || '/' || dm_members from watch_settings where guild_id='${G}'`,
    ) === "none/true",
  );
  const shown = await page.evaluate(() => [
    document.querySelector("#logChannelId").value,
    document.querySelector('input[name="dmMembers"]').checked,
  ]);
  check(
    "form shows the stored values after undo",
    shown[0] === "" && shown[1] === true,
    JSON.stringify(shown),
  );
  await page.screenshot({ path: `${S}/settings-after-undo.png`, fullPage: true });

  check("no CSP violations", csp.length === 0, csp.join(" | ").slice(0, 200));
  await browser.close();

  // 7. Replay a real Server Action from another origin.
  const before = sql(`select count(*) from settings_changes`);
  const replay = execSync(
    `curl -s -o /dev/null -w "%{http_code}" -X POST ${B}/servers/${G}/settings -H "Origin: https://evil.example" -H "Next-Action: ${actionId}" -H "Cookie: __Host-garrison_session=${process.env.E2E_SESSION_TOKEN}" -F guildId=${G} -F logChannelId= -F appealText=pwned`,
  ).toString();
  check(
    "cross-origin Server Action refused",
    sql(`select count(*) from settings_changes`) === before &&
      sql(`select coalesce(appeal_text,'') from watch_settings where guild_id='${G}'`) !== "pwned",
    `HTTP ${replay}`,
  );

  console.log(results.join("\n"));
  process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
})();
