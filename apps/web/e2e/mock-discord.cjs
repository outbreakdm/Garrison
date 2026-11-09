// Stand-in for the Discord endpoints the dashboard calls with the bot token.
const http = require("node:http");
const MANAGE = String(1n << 5n);
const guilds = {
  "111111111111111111": {
    owner_id: "999",
    roles: [
      { id: "111111111111111111", name: "@everyone", position: 0, permissions: "0" },
      { id: "mods", name: "Mods", position: 3, permissions: MANAGE, color: 0x5ab0ff },
      {
        id: "500000000000000001",
        name: "Raiders",
        position: 2,
        permissions: "0",
        mentionable: true,
        color: 0xffb547,
      },
      { id: "500000000000000002", name: "Garrison", position: 4, permissions: "0", managed: true },
    ],
    members: { 1: ["mods"] },
    // People the member search and member pages can find.
    people: [
      {
        id: "700000000000000001",
        username: "brakk",
        nick: "Brakk Ironjaw",
        roles: ["500000000000000001"],
      },
      { id: "700000000000000002", username: "brenna.w", nick: null, roles: [] },
      { id: "700000000000000003", username: "sootbot", nick: null, roles: [], bot: true },
    ],
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
    if (req.url === "/users/@me")
      return json(200, { id: "123456789012345678", username: "Garrison", bot: true });
    if (req.url === "/applications/@me")
      return json(200, { id: "123456789012345678", flags: 1 << 15, bot_public: true });
    const person = (p) => ({
      user: { id: p.id, username: p.username, global_name: null, avatar: null, bot: p.bot },
      nick: p.nick,
      roles: p.roles,
      joined_at: "2025-03-14T18:00:00.000Z",
    });
    const search = req.url.match(/^\/guilds\/(\d+)\/members\/search\?query=([^&]*)/);
    if (search) {
      const q = decodeURIComponent(search[2]).toLowerCase();
      const people = guilds[search[1]]?.people ?? [];
      return json(
        200,
        people
          .filter((p) => p.username.startsWith(q) || (p.nick ?? "").toLowerCase().startsWith(q))
          .map(person),
      );
    }
    const user = req.url.match(/^\/users\/(\d+)$/);
    if (user)
      return user[1] === "700000000000000009"
        ? json(200, { id: user[1], username: "gone.raider", avatar: null })
        : json(404, {});
    const m = req.url.match(/^\/guilds\/(\d+)(\/members\/(\w+)|\/channels)?$/);
    const g = m && guilds[m[1]];
    if (!g) return json(404, {});
    if (m[2] === "/channels") {
      const cat = { info: "310000000000000001", staff: "310000000000000002" };
      const hide = [{ id: m[1], deny: String(1n << 10n) }];
      return json(200, [
        { id: cat.info, name: "Town Square", type: 4, position: 0 },
        { id: cat.staff, name: "Staff", type: 4, position: 1 },
        { id: "300000000000000001", name: "general", type: 0, position: 0, parent_id: cat.info },
        {
          id: "300000000000000002",
          name: "mod-log",
          type: 0,
          position: 1,
          parent_id: cat.staff,
          permission_overwrites: hide,
        },
        { id: "300000000000000003", name: "Voice", type: 2, position: 2, parent_id: cat.info },
      ]);
    }
    if (m[3]) {
      const p = (g.people ?? []).find((x) => x.id === m[3]);
      if (p) return json(200, person(p));
      return g.members[m[3]] ? json(200, { roles: g.members[m[3]] }) : json(404, {});
    }
    return json(200, { id: m[1], owner_id: g.owner_id, roles: g.roles });
  })
  .listen(4100);
