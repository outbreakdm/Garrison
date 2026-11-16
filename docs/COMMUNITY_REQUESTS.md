# Community requests

Collected 2026-11-16 from the suggestions forum of another bot's community (the owner's
screenshots). These are ideas people asked for; how Garrison does each one is Garrison's own
design.

**Owner's picks (2026-11-16):** the proposed order; regex runs in Discord's own AutoMod; a
shared Insights link can be embedded in other sites when the owner switches that on.

**Status:** 1 to 3 **deployed** (2026-11-16, `7849b5a`, run 43974339633; migrations 0065 to 0068
applied). 4. Threads and forum posts **built**, not deployed (no migration). Next: 5. Invite
tracker.

| # | Request | Garrison today | Size |
|---|---|---|---|
| 1 | Server stats: channels whose names show counts (members, staff, channels, roles, bots) | Nothing | S |
| 2 | Regex moderation, matching Discord's AutoMod regex | Blocked words (plain text) | M |
| 3 | Verification questions: open text boxes ("What's your in-game name?"), formatted descriptions | A Verify button and a website check | M |
| 4 | Messages into threads and forum posts (by link or ID), richer embeds | Text channels only | M |
| 5 | Invite tracker: name, color, description, category and an auto-role per invite, and adding invites made elsewhere (Disboard, socials) | Which invite each member joined with, top inviters in Logs | M |
| 6 | Partnerships: partner servers and what they bring, across your servers on Agency | Nothing | M |
| 7 | Share Insights as a link, or embed it in Notion | CSV download | S |
| 8 | Economy: server currency with a custom name and icon, earning, a shop | Nothing | L |

## 1. Server stats (built)

A **Server stats** page under Community: pick counters and Garrison keeps a voice channel
nobody can join per counter, named like "Members: 372", with a live preview of the channel
list beside the counters. Free runs three counters, Pro ten; counters past the limit pause
on Free. The bot fetches the member list once (then join and leave events keep it current)
for People, Bots and role counts, and renames in its own loop so a rename Discord makes wait
never holds up the other sweeps. Still to check on a test server: the channels appear, a
count updates within ten minutes, removing a counter deletes its channel, off removes the
category.

- Counters: members, humans, bots, online, boosts, channels, roles, members with a role (the
  owner picks the role, so "Staff: 8" is the Staff role's count).
- Names are a template per counter with `{count}`, so it reads in the server's own words.
- Garrison makes the channels in a category (voice channels nobody can join), or uses
  channels the owner picks. Discord lets a channel be renamed twice in ten minutes, so the
  bot updates every ten minutes, and only when a number changed.

## 2. Regex moderation (built)

Built as planned: a **Patterns** panel on Moderation (Free 3, Pro 10), always-allowed words, a
tester that runs the patterns in the browser (any case, Unicode, as Discord does), and
Discord's answer under them. The bot keeps one keyword rule ("Garrison: blocked patterns") in
step, sends only when something changed, records Discord's refusal per pattern, and turns
each block into a case through the AutoMod execution intent (not privileged). Still to check
on a test server: the rule appears in Server Settings → AutoMod, a matching message is
blocked, the case and timeout follow, and removing every pattern deletes the rule.

Patterns are run by Discord's own AutoMod, not by Garrison: Discord's engine can't be made
to hang on a bad pattern, and it's what people asked for by name. Garrison keeps one AutoMod
rule per server named for Garrison, with up to 10 patterns (Discord's limit, 260 characters
each), allowed words, and who it skips.

- Panel in Moderation, beside Blocked words: the patterns, a "test it" box that runs them on
  a sample line in the browser (marked as an approximation of Discord's engine), and what
  happens after: Discord blocks the message and Garrison records a case and applies the
  automod action (nothing more, warn, time out), so the escalation ladder counts it.
- Needs the AutoMod execution gateway intent (not privileged). Manage Server is already
  granted.

## 3. Verification questions (built)

Built as planned, with one change: Discord's forms now show Markdown, so the formatted text is
an **intro** at the top of the form (it takes one of the form's five places), and each question
has a plain line under it. Questions panel on Security with a preview of the form; answers go to
a staff channel as a card (Approve and Deny when staff approve each member); a "Waiting for
staff" list on Security approves or denies through a manager's dashboard request; the website
verify page asks the same questions. Answers are deleted after 30 days. Still to check on a
test server: the form opens from Verify with the intro, answers post to the staff channel, the
buttons decide once, and the website form (the local preview's test user isn't a real member).

Up to 5 questions (Discord's modal holds 5), each a short or long answer, with a description
written with the same Markdown as cards. Pressing Verify opens them in Discord; the website
verify page asks the same.

- Answers go to a staff channel as a card, and are kept with the member's record for 30 days.
- Two ways to finish: **instant** (answering is enough: the role is given at once) or
  **reviewed** (staff press Approve or Deny on the card; Deny can kick).
- The answers card is only ever posted to the staff channel; nothing members wrote is shown
  publicly.

## 4. Messages into threads and forums (built)

Built: a message's **Where** lists channels, forums ("a new post each time") and open threads;
a thread or post that isn't open can be picked by pasting its link (posting opens it again). A
forum needs a post title and can carry up to five of the forum's tags. **Update a post** in the
post bar edits a message Garrison posted from Messages, by its link, in place. Left for later:
richer embeds (author icon, timestamp, several embeds), which touch the shared card editor
every module uses. Still to check on a test server: a post in a thread, a forum post with tags,
an archived thread by link, and an update by link.

Where a message posts becomes one of: a channel, a thread (picked from the server's active
threads, or a pasted link), or a **new forum post** in a forum channel (its title and tags).
Plus **edit a posted message** by link: Garrison can only edit its own messages, so this is
for messages Garrison posted. Richer embeds: an author icon, a timestamp, inline fields, and
more than one embed per message.

## 5. Invite tracker

An **Invites** page under Community:

- Every invite in the server with its uses and who joined with it; each can get a name, a
  color, a description, a category ("Socials", "Partners", "Ads") and an auto-role given to
  people who join with it.
- **Add an invite made elsewhere** (a Disboard bump link, a social bio link) by pasting it:
  Garrison checks it belongs to this server and tracks it like its own.
- Joins per invite, and per category, over time, in Insights.

## 6. Partnerships

Built on the invite tracker: a **Partners** category whose invites carry the partner
server's name, a contact, and a partnership note. A partners view lists each partner with
the members they brought and how many stayed a week. On Agency, the view spans every server
the plan covers.

## 7. Share Insights

A manager can turn on a **share link** for Insights: a long, random address that shows a
read-only copy (no member names, only counts and charts), with the range and tabs. It can be
embedded in other sites (Notion, a wiki) when the owner allows embedding, and the link can be
replaced or turned off at any time. Nothing else on the dashboard is reachable from it.

## 8. Economy

A server currency with its own name and icon (an emoji):

- **Earn**: per message (with a cooldown, like XP), a daily claim, time in voice, and grants
  from staff. **Spend**: a shop of roles (given for good or for a time) and custom items staff
  hand out by hand.
- Balances, a leaderboard, and a history of every change; staff give and take with a reason,
  recorded like a case. Members see their wallet on their member page and with /balance.
- No gambling games and nothing that touches real money.

## Proposed order

1. Server stats (small, wanted, quick to show).
2. Regex moderation.
3. Verification questions.
4. Messages into threads and forums.
5. Invite tracker, then 6. Partnerships on top of it.
7. Share Insights.
8. Economy (the largest: its own design pass first).
