# Testing everything

How to check that every part of Garrison works, before launch and after big changes. Written
2026-11-21. Two halves: the automated checks (minutes, on your computer) and the hands-on pass
in Discord and the dashboard (an hour or two, on a test server).

Tick as you go. When something fails, note the page, what you did and what you saw, and the
time: Garrison's logs and the database line up by time.

## Part 1: automated checks

Run from the repository root.

```powershell
pnpm install
```

```powershell
npx vitest run
```

All tests pass (851 on 2026-11-21). They run every migration on an in-memory Postgres and
check each database login's permissions, so a missing grant shows up here.

```powershell
pnpm -r typecheck
```

```powershell
npx biome check apps packages
```

Lint. Files you didn't touch may report line-ending noise on Windows; only files you changed
must be clean.

```powershell
cd apps/web; npx next build; cd ../..
```

The dashboard's production build: catches server and browser code mixed up, which tests miss.

After a deploy, the deploy run's **Preflight** step checks the live Discord token, intents,
both database logins and the schema, and lists which optional features are on.

## Part 2: before the hands-on pass

- A **test server** you own, with Garrison added through the normal invite link, and its role
  dragged near the top.
- A **second Discord account** (a member, not staff) for the member side: joining, applying,
  counting, trivia, leaving and rejoining.
- A few channels (`#general`, `#mod-log`, `#counting`, `#staff`), a few roles, and one role
  with no permissions to hand out.
- **Pro** on the test server for the Pro parts: buy it once with a real card and
  refund it at the end (section 28), or set the plan from the staff page.
- The dashboard at `https://dash.garrisonbot.com`, signed in as the server's owner.

Each line below is: what to do → what should happen.

## Part 3: hands-on, page by page

### 1. Adding Garrison and the Overview

- [ ] Add Garrison to a fresh server → it posts one hello with a link to the dashboard.
- [ ] Overview → "Set up in three clicks" sits full width with three numbered rows.
- [ ] **Turn on protection** → the row ticks; Moderation shows automod and AI moderation on.
- [ ] Welcome row: pick a channel → the row ticks; join with the second account → a welcome
  card appears.
- [ ] Build row: pick a preset → the AI assistant opens with that request ready.
- [ ] **Hide** → the card goes; it doesn't come back on reload.
- [ ] `/health` in Discord → lists permissions and settings; anything missing has a fix.

### 2. AI assistant

- [ ] Ask "add a #clips channel and a Streamer role" → a reply and a plan to review.
- [ ] **Show changes** → the plan lists both; **Build** → they appear in Discord.
- [ ] **Undo** → both are gone again.
- [ ] Supplies on the page go down by about what the reply said it cost.
- [ ] On a Free server, Smart is locked and says it comes with Pro.
- [ ] `/qm build`, `/qm history`, `/qm undo` in Discord do the same from there.

### 3. Insights

- [ ] Opens with charts; after some chat, today's numbers move (they count, never store text).
- [ ] Share → the share link opens without signing in and shows no names.

### 4. Moderation

- [ ] `/warn`, `/timeout`, `/kick`, `/ban` the second account → each makes a case, DMs them
  (if on) and posts in the log channel.
- [ ] `/case` with the number, `/history` on the member, `/note add` and `/note list`.
- [ ] `/purge` 5 → five messages go.
- [ ] Automod: post a known scam link and a blocked word with the second account → removed.
- [ ] AI moderation on → a clearly hateful test message is removed (OpenAI's check).
- [ ] Escalation rules: three warnings → the ladder's action happens.
- [ ] Appeals on → a banned member's appeal page works and the appeal shows on the dashboard.
- [ ] `/moderation` shows and changes the same settings as the page.

### 5. Security

- [ ] `/verify setup` → a verify button; the second account gets the role after verifying
  (and answering questions, if set). `/verify off` stops it.
- [ ] Web verification page works (with the captcha once Turnstile keys are set).
- [ ] `/lockdown start` → members can't post and invites pause; `/lockdown status`; `/lockdown
      end` puts it all back.
- [ ] Take a backup on the page → it lists roles and channels; restoring a deleted test role
  brings it back.
- [ ] `/security` shows the anti-raid settings.

### 6. Logs

- [ ] Edit and delete a message, change a nickname, join voice → each shows in the log channel
  and on the page; `/logs search` finds them.
- [ ] "Keep message text" on → the deleted message's text is kept; off → only that it happened.

### 7. Welcome

- [ ] Join, leave and DM cards each fire when on, with the server's own text; the Pro image
  shows on a Pro server.
- [ ] Join roles are given on join.

### 8. Role menus

- [ ] Make a menu with buttons and one with a dropdown, post both → the second account picks
  and drops roles.
- [ ] A role with moderation powers can't be put on a menu.

### 9. Invites

- [ ] Make an invite, join through it → the page counts the join under that invite and label.

### 10. Game accounts

- [ ] `/link osrs` with a real RuneScape name → shows total and combat level, marked claimed.
- [ ] Account page → **Link from Discord Connections** imports Steam, Riot, Twitch and the rest.
- [ ] Battle.net → WoW characters with level and class.
- [ ] `/link share` on, `/roster accounts` → they show; off → they don't.
- [ ] Organized raid: `/raid create style:Organized team:Main raid` → the card asks Coming,
  Tentative, Late or Can't and lists the team under No reply yet. Coming with a roster
  character answers as it (its role); the dropdowns switch character or role; Can't leaves
  the reminders. The player page and the Raids tab answer the same way.
- [ ] Lineup: Raids → an organized raid → Pick the lineup → Fill by role (tanks in different
      groups), drag one player to the bench, Save and post → the card shows Group 1… and the
      bench, and one message pings only the players in groups. Save as a lineup, then Use it on
      next week's raid.
- [ ] Group host controls: `/lfg create`, someone joins → Manage (only the host or a moderator):
      Remove them (and their voice access), Lock (Join turns off; a newcomer is told it's
      locked), Ping the group (a second ping within 10 min is refused), Hand the group to a member
      (the card shows the new host).
- [ ] Access groups: Settings → Access → make "Giveaway hosts" (Giveaways Edit, Logs View), add
      a role. Someone with only that role: the server is under Shared with you; the menu shows
      Overview, Logs, Giveaways, Help; Logs is read-only; Moderation is "not found"; a giveaway
      starts; `/access` lists the same. Tick "Coins and purchases" plus Economy Edit → Give or
      take works for them; without the switch it's refused.
- [ ] Raid roster: Groups and raids → Roster → add a WoW team; Find a member → add someone as
  Trial with a note. `/roster add name:X class:Shaman spec:Restoration` → role Healer, first
  character is the main; `/roster main` switches it; `/roster team` shows the team without
  the note; the player page lists your characters and teams, never the note.
- [ ] Roles from game stats (Pro): a rule "OSRS total level 1+" gives the role within 30
  minutes; Steam and League rules work once their keys are set (see `docs/KEYS.md`).

### 11. Utilities

- [ ] **Roles back on rejoin** on → the second account leaves and rejoins → its roles return
  (not a skipped role, not a moderator role).
- [ ] `/temprole give` the second account a role for `2m` → it gets it; after 2 minutes it's
  gone; `/temprole list` shows it while it runs.
- [ ] A sticky message → chat a few lines → about 10 seconds later the sticky is at the
  bottom again, and the old one is deleted.
- [ ] A self-clearing channel set to 1 hour → messages older than an hour disappear (checked
  every 10 minutes; Garrison needs Manage Messages there).

### 12. Leveling

- [ ] Chat with the second account → `/rank` shows XP; `/leaderboard` lists it.
- [ ] Level-up message posts where set, in the server's language (section 27).
- [ ] `/ranks reward` gives a role at a level; `/rankcard` fills the card's details.

### 13. Economy

- [ ] `/daily`, `/balance`, `/pay` the other account, `/shop`, `/buy` an item.
- [ ] `/money give` and `/money take` (staff) with a reason → shows in the ledger.

### 14. Giveaways

- [ ] `/giveaway start` short → the second account enters → it ends and picks a winner;
  `/giveaway reroll` picks again; `/giveaway cancel` on another one.

### 15. Starboard

- [ ] React with the star enough times → the message is copied to the starboard channel.

### 16. Suggestions

- [ ] `/suggest` → a card with votes; mark it Planned on the page → the card updates.

### 17. Fun

- [ ] Birthdays on with a channel → `/birthday set` today's date with the second account →
  the greeting posts after midnight in the server's time zone (Settings → Server), and the
  birthday role is given for the day. `/birthday list`, `/birthday remove`.
- [ ] Counting channel → count 1, 2, 3 with two accounts (✅ each); count twice in a row or
  skip a number → ❌ and a message that it starts again from 1. The page shows the best.
- [ ] `/trivia` → four buttons; a wrong guess says "Not that one" (only to them); the right one
  wins; after 30 seconds unanswered it shows the answer.

### 18. Messages

- [ ] A saved message posted now, and one scheduled 5 minutes out → both post.
- [ ] An auto-responder on a word → the second account says it → Garrison replies once per
  cooldown. A message automod removes gets no reply.
- [ ] A tag → `/tag` with autocomplete posts it.

### 19. Stream alerts

- [ ] **Send a test alert** on each feed → a sample posts without the ping.
- [ ] YouTube and Twitch feeds of an active channel post on the next upload or stream.
- [ ] RSS (a blog) and Bluesky (an active account) → a new post appears within 10 minutes.
  The first check only notes what's there, so nothing old is posted.
- [ ] Kick and Reddit once their keys are set; before that they say they're waiting for keys.
- [ ] Twitch subscriber role (Pro, once `TWITCH_EVENTSUB_SECRET` is set) → **Connect your
      Twitch channel** as the streamer → "Connected, N subscribers found" → pick a role → a
  subscriber who linked Twitch gets it within 5 minutes. **Disconnect** stops it.

### 20. Server stats

- [ ] A member-count counter → its voice channel name updates within about 10 minutes.

### 21. Tickets

- [ ] Post a panel → the second account opens a ticket (with the form, if set) → a private
  channel for it and the staff roles.
- [ ] `/ticket claim`, `/ticket add` and `/ticket remove` a member, then `/ticket close` with a
  reason → the transcript is on the dashboard.
- [ ] `/ticket assist` (Pro, staff) in an open ticket → a private summary and suggested reply,
  and a few supplies used. A member running it gets "Staff only".
- [ ] Modmail on → DM Garrison from the second account → a ticket opens.

### 22. Applications

- [ ] Make a form with two questions, post its panel → the second account applies → a card
  with Accept and Decline in the staff channel and under Waiting for staff.
- [ ] Accept → the form's roles are given and the applicant gets a DM. Decline another.

### 23. Groups and raids

- [ ] `/lfg create` → the second account joins → `/lfg close`; `/lfg list`.
- [ ] `/raid create` with roles → sign up and bench; `/raid list`; the calendar shows it and
  its feed link works in a calendar app.

### 24. Voice rooms

- [ ] Join the creator channel → a room is made and you're moved in (needs Move Members); it's
  deleted when empty.

### 25. Settings

- [ ] Change a setting anywhere → Settings → History lists it → **Undo** puts it back.
- [ ] Access: share the dashboard with the second account as a viewer → it can look, not
  change.
- [ ] Garrison's profile: nickname and look change in the server.
- [ ] Member pages: the second account's `/play/<server ID>` shows You and (if on) its record.

### 26. Public page

- [ ] Settings → Public page on → `https://garrisonbot.com/s/<server ID>` opens without
  signing in: name, icon, member count, About, Join button.
- [ ] Leaderboard switch on → the top members show; off → the section goes.
- [ ] Pro: a name of its own (`/s/your-name`); a name another server has is refused.
- [ ] Turned off → the address says "not found".

### 27. Languages

- [ ] Settings → Server → Language: Español → a level-up, an alert heading and the public page
  are in Spanish. Back to English.
- [ ] A second account with Discord set to Deutsch sees slash command descriptions in German.

### 28. Plan and billing (real card, then refund)

- [ ] Plan page → Upgrade to Pro → Stripe checkout → back on the dashboard, Pro is on.
- [ ] Buy a small supply pack → the supplies show on the AI assistant page.
- [ ] **Manage billing** opens Stripe's portal; switch monthly and yearly.
- [ ] In the Stripe dashboard, refund the payments and cancel the subscription → the server is
  back on Free (paused extras stay saved).

### 29. Your account

- [ ] Download your data → one JSON file with your links, levels, birthdays and the rest.
- [ ] Sign out everywhere else → other browsers are signed out.
- [ ] Erase your data (on a throwaway account) → links, rank card details and birthdays are
  gone, and you're signed out.

### 30. Public site

- [ ] `https://garrisonbot.com`, `/terms`, `/privacy`, `/refunds` and `/status` load; status
  says Garrison is online.
- [ ] Paste `https://garrisonbot.com` in Discord → the preview shows the image.

## Part 4: afterwards

- Refund and cancel anything bought (section 28).
- Remove the test roles, channels and timed roles, or kick Garrison from the test server.
- Note anything that failed in `docs/ROADMAP.md` under Log, with the date.
