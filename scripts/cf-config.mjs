// Fill the Cloudflare configs with this account's values, in CI, from GitHub
// repository variables. Only non-secret values: secrets go in with
// `wrangler secret put`. Fails loudly if anything is missing.
import { readFileSync, writeFileSync } from "node:fs";

const need = (name, pattern) => {
  const v = (process.env[name] ?? "").trim();
  if (!v)
    throw new Error(
      `Set the GitHub variable ${name} (Settings → Secrets and variables → Actions → Variables).`,
    );
  if (pattern && !pattern.test(v)) throw new Error(`${name} doesn't look right: "${v}".`);
  return v;
};

const clientId = need("DISCORD_CLIENT_ID", /^\d{17,20}$/);
const appUrl = need("APP_URL", /^https:\/\/[a-z0-9.-]+$/i);
const hyperdriveId = need("HYPERDRIVE_ID", /^[0-9a-f]{32}$/);
const domain = (process.env.DASHBOARD_DOMAIN ?? "").trim();
if (domain && !/^[a-z0-9.-]+$/i.test(domain))
  throw new Error(`DASHBOARD_DOMAIN doesn't look right: "${domain}".`);

function fill(path, swaps) {
  let text = readFileSync(path, "utf8");
  for (const [from, to] of swaps) {
    if (!text.includes(from)) throw new Error(`${path}: expected to find ${from}`);
    text = text.replaceAll(from, to);
  }
  writeFileSync(path, text);
  console.log(`Configured ${path}`);
}

fill("apps/web/wrangler.jsonc", [
  ['"APP_URL": "https://dash.example.com"', `"APP_URL": ${JSON.stringify(appUrl)}`],
  ['"DISCORD_CLIENT_ID": "000000000000000000"', `"DISCORD_CLIENT_ID": ${JSON.stringify(clientId)}`],
  ['"id": "00000000000000000000000000000000"', `"id": ${JSON.stringify(hyperdriveId)}`],
  ...(domain
    ? [
        [
          '// "routes": [{ "pattern": "dash.example.com", "custom_domain": true }],',
          `"routes": [{ "pattern": ${JSON.stringify(domain)}, "custom_domain": true }],`,
        ],
      ]
    : []),
]);
fill("apps/bot-cloudflare/wrangler.jsonc", [
  ['"DISCORD_CLIENT_ID": "000000000000000000"', `"DISCORD_CLIENT_ID": ${JSON.stringify(clientId)}`],
]);
