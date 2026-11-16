# Member pages: what a member can do on the dashboard

Proposed 2026-11-16 (phase 4 of `docs/DASHBOARD_FIRST.md`). Owner's picks (2026-11-16): first
build **You** and **Your record**; on by default with owner switches (Your record off until
turned on); members change only their card's details. **Built** (not deployed): Servers you're
in, the member space's tabs, You, Your record, and Settings → Member pages. Roles, Suggestions
and Giveaways are still to come.

## Today

- A member without Manage Server can sign in, but the server list shows them nothing unless a
  manager shared the dashboard with them. The player page exists (join a group, sign up for a
  raid, the raid calendar), yet the only ways in are a link a manager posts or the calendar.
- In Discord, members already: check `/rank` and `/leaderboard`, fill in their rank card with
  `/rankcard` (the fields the server's card design asks for, stored per server in
  `rank_profiles.details`), pick roles from posted role menus, `/suggest` and vote, `/lfg`, sign
  up for raids, enter giveaways, open tickets, `/link` game accounts, and appeal a ban on its
  own page.

## The idea

Everything a member does for themselves in Discord can be done on the dashboard too, in a
space of their own per server. It never shows settings, logs, other people's cases or tickets,
and it never changes the server: a member's changes touch only that member (their card, their
roles from posted menus, their votes, their signups).

### Finding it

- `/servers` gets **Servers you're in**: every server with Garrison you're a member of (from
  the list Discord gives at sign-in), each opening your space there.
- Managers get a "See it as a member" link from their dashboard.

### Your space in a server (`/play/[guildId]`, grown from the player page)

1. **You**: your level, XP and place, your rank card as it looks in Discord, and its details
   to fill in (the same fields `/rankcard` asks for). The game accounts you share with this
   server, with sharing on or off (linking stays on Account).
2. **Groups and raids**: as today, plus posting a group from the server's LFG templates
   (the same limits as `/lfg`).
3. **Roles**: the server's posted role menus as switches: pick or drop your own roles, with the
   same rules as the buttons in Discord (only the roles in those menus, the menu's limit and
   required role). The bot gives them and checks again.
4. **Suggestions**: post one, vote For or Against, see what's planned or done.
5. **Leaderboard**: the top members and where you are.
6. **Giveaways**: enter the ones running.
7. **Your record**: your own warnings, timeouts and bans in this server, with how to appeal.

A section shows only when its module is on in that server.

### What owners control

Settings gets **Member pages**: a switch per section. Nothing is a new risk for the server
(members can already do all of it in Discord), so the proposal is on by default, except
"Your record", which shows a member their own cases and is the owner's call.

### Safety

- A fourth access level, **member**: a current member of the server, checked live with Discord
  like the others. `checkGuildAccess` gains it below viewer; every member page and action says
  so explicitly, and manager pages stay closed to it.
- Every member change is its own request kind that the bot re-checks: still a member, the role
  is in a posted menu and within its limits, the card field is one the server's design asks
  for, the vote is their own. Rate limits per member, like the dashboard's other requests.
- Tests: a member trying each manager action is refused; a member can't change another
  member's card, roles or votes; role picks outside posted menus are refused by the bot.

## Order (each ships on its own)

1. Finding it (Servers you're in) and **You** (rank card details, level, sharing) plus the
   leaderboard.
2. **Roles** from posted menus.
3. **Suggestions** and **Giveaways**.
4. **Your record**, and the owner's **Member pages** switches in Settings.
