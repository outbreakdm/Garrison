// Stand-in for the three Discord endpoints the dashboard calls with the bot token.
const http = require("node:http");
const MANAGE = String(1n << 5n);
const guilds = {
  "111111111111111111": {
    owner_id: "999",
    roles: [
      { id: "111111111111111111", permissions: "0" },
      { id: "mods", permissions: MANAGE },
    ],
    members: { 1: ["mods"] },
  },
  // User 1 is a plain member here: no Manage Server.
  "222222222222222222": {
    owner_id: "999",
    roles: [{ id: "222222222222222222", permissions: "0" }],
    members: { 1: [] },
  },
};
http
  .createServer((req, res) => {
    const json = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== "Bot test-bot-token") return json(401, {});
    const m = req.url.match(/^\/guilds\/(\d+)(\/members\/(\w+)|\/channels)?$/);
    const g = m && guilds[m[1]];
    if (!g) return json(404, {});
    if (m[2] === "/channels")
      return json(200, [
        { id: "300000000000000001", name: "general", type: 0, position: 0 },
        { id: "300000000000000002", name: "mod-log", type: 0, position: 1 },
        { id: "300000000000000003", name: "Voice", type: 2, position: 2 },
      ]);
    if (m[3]) return g.members[m[3]] ? json(200, { roles: g.members[m[3]] }) : json(404, {});
    return json(200, { id: m[1], owner_id: g.owner_id, roles: g.roles });
  })
  .listen(4100);
