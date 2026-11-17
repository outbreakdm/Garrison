# Layout proposal: one predictable page, everywhere

2026-11-17. An `/impeccable layout` pass over every dashboard page, with a proposal to make the
layouts easier to find your way around. **Proposal only: nothing here is built yet.** The
decisions that need the owner are at the end.

## What I looked at

- **Every page, both widths.** 30 routes captured full height at 1440 px and at 390 px (phone),
  on the local test server (Iron Vanguard). Member space (`/play`) showed "Nothing here" for the
  test account, so it is judged from code only.
- **Each page's structure, read from the DOM.** Columns, panel counts and kinds, head parts, page
  height, sideways overflow (none on any page).
- **The layout code.** `console.css` (the page split and its two variants), `app.css` (three
  separate `.page-head` blocks layered over each other), the menu (`ServerNav.tsx`).
- **The impeccable layout scan** (`detect --scope layout`). It found nothing: no mechanical slips
  (spacing scale, overflow, stacking). The problems below are about structure and hierarchy, which
  a scan can't see.
- **Measurements** at 1440 x 900 and 390 x 844 (see Findings).

## The short version

The parts are good: header bars, settings that save themselves, editors beside a live preview,
list heads with a dashed "new" tile. What's hard is **predicting where things are**, because the
same building blocks are arranged differently on every page. Eight changes fix most of it:

1. **One meaning for each column.** Today the wide column holds settings on some pages and the
   live list on others (Moderation vs Leveling, Suggestions, Tickets). Pick one rule.
2. **Split long pages by job, with page tabs.** Moderation is 12 panels and 3,637 px tall; it mixes
   acting now (cases, moderate a member), setting up (automod) and reviewing (appeals, ladder).
   Tabs per job, each with its own address, reuse the Insights tabs that already exist.
3. **Three page templates instead of eight shapes:** Activity, Setup and Library, plus a
   Compact one for small modules. Each has one fixed layout, so learning one page teaches all of
   them.
4. **A menu that fits the screen.** Pin the server card and plan card, scroll only the list,
   regroup the 22 items so the groups mean something, and let groups fold.
5. **Phones: content in the first third, not chrome.** Merge the page bar with the page title,
   put search behind an icon, and stop the title appearing twice.
6. **Fields sized to their content,** with related numbers on one line ("More than 6 messages
   within 8 seconds"), not full-width boxes 900 px wide.
7. **Say a problem once.** The head's "Needs you" pill and a red banner currently repeat the same
   sentence (Voice rooms, Server stats).
8. **An Overview with a real grid:** four bands, each with a job, instead of five different
   column splits in a row.

## What's working (keep it)

- **Header bars** that name, count and switch a panel. The state reads before the prose.
- **Settings that save themselves**, with Undo in the toast.
- **Editors beside a live Discord preview** (Welcome, Leave, DM, Rank card, Server stats).
- **List head plus a dashed "new" tile** (Role menus, Messages, Stream alerts, Giveaways): calm and
  obvious.
- **Insights' page tabs:** link tabs with their own address and the range on the same row. This
  is the model for item 2.
- **Security and Moderation put the tools first on phones** (Lockdown, Moderate a member). The
  instinct is right: make it the rule, not a per-page exception.
- **The raid calendar becomes an agenda on phones,** and preset cards go two by two.

## Findings

### F1. The two columns mean different things on different pages

DESIGN.md says the wide column holds settings and the side column holds tools and live lists.
Three pages follow that; three do the opposite; two more use a "setup" variant that swaps the
columns when a list is empty (`.page-split--setup`, `order: -1`), and two use `--tools-first`
for phones only.

| Page | Wide column (773 px at 1440) | Side column (307 px) |
| --- | --- | --- |
| Moderation | settings (Appeals, Automod x5, AI moderation, skips) | tools + a settings panel (Cases and appeals) |
| Security | settings (Anti-raid, Verification, Questions, Anti-nuke) | tools (Lockdown, Quarantined, Backups) |
| Logs | settings + the events table | a live list (Top inviters) |
| Leveling | **live list** (Most XP, Seasons) | **settings** (Leveling, XP boosts) |
| Suggestions | **live list** (Board) | **settings** |
| Tickets | **live list** (Needs reply) | **settings** (Who handles tickets) |
| Starboard, Voice rooms | settings (setup variant, list empty) | the empty live list |
| Economy, Welcome, Settings, Groups | no split | |

A person who learns "settings are on the left" on Moderation looks in the wrong place on
Leveling. Settings also hide in the side column at 307 px, where long help text wraps to 8 lines
(Tickets' "Who handles tickets").

### F2. Long pages mix three jobs

| Page | Desktop height | Phone height | Panels | Jobs mixed |
| --- | --- | --- | --- | --- |
| Moderation | 3,637 px | 6,374 px | 12 | act now, set up automod, review cases and appeals |
| Settings | 3,406 px | 5,057 px | 7 | server, your account, access, Garrison's profile, history |
| Welcome | 2,669 px | 4,519 px | 5 | three different cards and two join extras |
| Security | 2,613 px | 4,122 px | 7 | act now (lockdown), set up (anti-raid, verification) |
| Leveling | 2,556 px | 3,794 px | 6 | leaderboard, settings, rank card, rewards |
| Economy | 2,067 px | 2,863 px | 7 | set up, then live (richest, ledger, give or take) |
| Groups and raids | 1,910 px | 2,549 px | 6 | groups, raids, calendar, attendance (+ templates on another page) |

On Moderation, the automod setup a person changes once a month sits above the cases they read
every day, and the cases table starts about 2,600 px down.

### F3. The first thing on a page isn't the most-used thing

- **Moderation** opens with Appeals, empty most days ("No appeals waiting"). It's also the
  first panel on phones (290 px down).
- **Leveling** leaves a hole of about 190 px under Seasons, because the side column is taller
  than the main one and the full-width Rank card waits below both.
- **Settings** opens with time zone and "Your account". "Your account" isn't a server setting,
  and it's already in the top bar.

### F4. The menu is 41% taller than the screen

At 1440 x 900 the menu is 1,269 px of content in a 900 px rail (22 items, 6 groups, the server
card and the plan card). On the lower pages (Invites, Server stats, Groups and raids, Voice
rooms, Game accounts) the rail scrolls to the current item, and **the server card and logo scroll
out of view**.

The groups are also hard to predict:
- **Engagement vs Community:** Suggestions, Starboard and Giveaways sit under Engagement, while
  Messages, Stream alerts, Invites and Server stats sit under Community.
- **Settings and Plan are split up:** Settings sits up top while Plan only shows on the phone
  sheet.

### F5. On a phone, a third of the screen is chrome

Before the first panel there are:
- the top bar (logo, server switcher, theme, avatar)
- a full-width search bar
- a pinned page bar ("Moderation · All pages")
- the page title, which says "Moderation" again
- the state pill

The title sits 171 px down and the first panel 282 to 290 px down an 844 px screen. The "Needs
you" pill is cut off sideways on Voice rooms ("…it needs Mov").

Tickets' three count tiles (Open now, Need a reply, Unclaimed) stack full width on phones, which
takes about 300 px to show three numbers.

### F6. Fields run the full width of their panel

At 1440, text fields and selects are up to 993 px wide:
- **Settings:** the time zone field and "Give a person access" are about 990 px wide.
- **Leveling:** each Level rewards select is 958 px wide.
- **Moderation:** 5 of its 37 fields are over 500 px.

A one-word value in a 990 px box makes the eye travel and weakens grouping. Related numbers sit
in separate boxes far apart: "More than (messages) 6" and "Within (seconds) 8" read as two
settings, but they're one rule.

### F7. Repeating rows show every empty slot

- **Level rewards:** ten "Level / No reward" rows, about 230 px of empty selects.
- **XP boosts:** five rows, most of them "No boost".
- **Roles from game stats:** three rows of empty pickers.

The page looks finished only when every slot is used.

### F8. A problem is said twice

Voice rooms shows both the head's "Needs you · Garrison can't move members…" and a red banner
with the same sentence. Server stats shows the banner, and its head says "Off" without saying why
it can't work.

### F9. Secondary pages are reached four different ways

- **A head button:** Groups and raids → LFG templates.
- **A panel of links:** Settings → "Inside other pages" (Escalation ladder, Level rewards, LFG
  templates).
- **Tabs:** Insights.
- **"View all" links in panel heads:** Overview → "Insights ›", "All cases ›".

None of these is wrong, but a person can't guess which one a page uses.

### F10. The Overview has no grid

Each row splits differently:
- 5 stat tiles
- 60/40 (messages, top channels)
- 40/60 (worth turning on, recent cases)
- three equal tiles (next raid, security, open groups)
- one full-width panel (Health checks, a sentence and a button)

Tiles of unequal height leave holes: "Worth turning on" is mostly empty beside Recent cases.

### F11. Mid-page pattern changes

- **Welcome:** a two-up row (Roles on join beside Welcome image) sits between three full-width card
  editors.
- **Economy:** a two-up row (Richest beside Give or take) sits between full-width panels.

The rhythm breaks without the content changing kind.

### F12. Ten breakpoints

The page CSS uses 720 (14 times), 520 (8), 1100 (4), 960, 860, 640 (3 each), 900, 560 and
1101 px. Layouts change at slightly different widths on different pages, which shows as
inconsistent behaviour on tablets.

## The proposal

### 1. One rule for the columns

**The wide column is for what you came to do now. The side column is for quick tools and small
facts. Settings live in their own Setup view (section 2), never in the side column.** On a phone,
the wide column comes first, every time. That makes `--tools-first` and `--setup` unnecessary:
both are workarounds for settings and tools sharing columns.

### 2. Page tabs for pages with more than one job

A module page with two or more jobs and five or more panels gets **page tabs** under its head.
They use the Insights component: link tabs, each with its own address (`/watch/automod`), the
current one underlined in the section colour. The first tab is the daily job.

Settings stay on the module's page, as the product rule requires; they're just one tab away
instead of 2,000 px below.

| Page | Tabs (first is the default) |
| --- | --- |
| Moderation | **Cases** · Automod · Appeals and ladder |
| Security | **Now** (lockdown, quarantine, backups) · Anti-raid · Verification · Anti-nuke |
| Settings | **General** · Access · Garrison's profile · History |
| Welcome | **Join** (card, image, roles on join) · Leave · DM |
| Leveling | **Leaderboard** (with seasons) · Settings · Rank card · Rewards |
| Tickets | **Queue** · Setup · Panels |
| Groups and raids | **Groups** · Raids · Calendar · Templates (the LFG templates page moves here) |
| Economy | **Activity** (richest, ledger, give or take) · Setup (currency, earning, shop) |
| Logs | **Events** · Setup |
| Game accounts | **Shared here** · Roles from stats |

A tab's head can carry a count or a state dot ("Appeals 2", "Anti-raid ●"), so nothing urgent is
hidden behind a tab.

### 3. Three templates, plus Compact

Each tab, and each small page, uses one of these. Nothing else.

**Activity** (what's happening: cases, queue, board, leaderboard, events):

```
┌ Head: gem · Title · state pill ─────────────────────────── [module switch] ┐
│ Tabs: Cases · Automod · Appeals and ladder                                 │
├─────────────────────────────────────────────────┬──────────────────────────┤
│ List head: filters ·············· count · [+ Create]│ Quick tools           │
│ ┌ the live list / table / board ────────────────┐│  Moderate a member     │
│ │                                               ││  Caught by automod     │
│ └───────────────────────────────────────────────┘│  (small facts)         │
└─────────────────────────────────────────────────┴──────────────────────────┘
phone: head, tabs (scrolling row), list, then quick tools
```

**Setup** (configuration):

```
┌ Head + tabs ─────────────────────────────────────────────────────────────┐
│ ┌ Panel: one decision ─────────────── save mark ┐  On this page          │
│ │ sentence-style fields, sized to content       │   ● Spam      Saved    │
│ └───────────────────────────────────────────────┘   ● Mentions  Saved    │
│ ┌ Panel ────────────────────────────────────────┐   ▲ Links     Needs you│
│ │ editor  ·····························  preview │   ○ Patterns  Off      │
│ └───────────────────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────────┘
one column of panels, max about 760 px of fields (editors with a preview may use the full width);
the "On this page" index (1280 px and up) jumps to a panel and shows each panel's save state.
phone: one column, no index.
```

**Library** (things you make: role menus, messages, stream alerts, giveaways, ticket panels, LFG
templates, shop items): the list head and tile grid as today. Opening a tile goes to a full-width
editor with its preview and a back link, instead of growing the tile inside the grid.

**Compact** (small modules: Starboard, Suggestions, Voice rooms, Server stats, Invites): one row,
with settings at 60% and the live list at 40%. On phones, the live list comes first when it has
items, then the settings.

### 4. The head, on every page

- **One line:** gem, title, section tag, then the state on the right. The intro is one sentence of
  at most about 90 characters. Today intros run to 230; the rest moves under a "How this works"
  link that opens a small sheet.
- **A problem is said once.** "Needs you" is a strip directly under the head: the reason in full,
  and the fix as a button ("Give Move Members"). The red banner is removed; the pill in the head
  stays short ("Needs you"). On phones the strip wraps instead of being cut off.
- **Tabs sit on the head's bottom hairline,** so the head and tabs together are about 110 px.

### 5. Phones: the first panel in the first third

```
┌──────────────────────────────┐
│ ◈ Iron Vanguard ⌄     ⌕  ☀ M │  top bar: server switcher, search icon, theme, account
├──────────────────────────────┤
│ ◆ Moderation          ⌄ pages│  the page bar is the title (an h1) and opens the page sheet
│ Automod On ●   Needs you ▲   │  state pills, wrapping
│ Cases · Automod · Appeals    │  tabs, scrolling sideways
├──────────────────────────────┤
│ first panel (~190 px down)   │
```

This saves about 100 px on every page. Search opens a full-screen sheet from the icon, as Ctrl K
does on desktop. Count tiles stay two or three to a row on phones (Tickets' three counts become
one 72 px strip).

### 6. A menu that fits

- **Pin the server card at the top and the plan card at the foot;** only the list between them
  scrolls. The switcher can never scroll away.
- **Tighten items from 34 to 32 px** and the gaps between groups, which recovers about 90 px.
- **Groups that fold,** remembering their state; the current page's group is always open.
- **Regroup by what an owner sets out to do:**

| Group | Items |
| --- | --- |
| (top, no label) | Overview · AI assistant · Insights |
| Safety | Moderation · Security · Logs |
| Members | Welcome · Role menus · Invites · Game accounts |
| Engagement | Leveling · Economy · Giveaways · Starboard · Suggestions |
| Posts | Messages · Stream alerts · Server stats |
| Support | Tickets |
| Gaming | Groups and raids · Voice rooms |
| (foot, no label) | Settings · Plan |

Settings and Plan go at the foot, where people look for them in most apps. Game accounts joins
Members because it's about who people are, not about running a game night.

### 7. Fields sized to their content

- **Three widths:** short (numbers, durations, a single emoji) 96 to 160 px; medium (names,
  pickers for a channel or role) up to 360 px; long (sentences, links) up to 640 px. Nothing is
  wider than 640 px except an editor with a preview.
- **Rules as sentences** where the setting is one rule: "Remove messages when someone sends more
  than [6] messages within [8] seconds" and "Lock down when [6] people join within [30] seconds".
  DESIGN.md already asks for settings sentences.
- **Repeating rows show what's set plus one empty row** and an "Add" button. Level rewards goes
  from ten rows to one when nothing is set.
- **Help text under a field stays at two lines at most;** anything longer goes behind "How this
  works".

### 8. The Overview as four bands

```
┌ Attention ──────────────────────────────────────────────────────────────────┐
│ ◈ Iron Vanguard · 128 members · Live          Health check 12 min ago · Run │
│ Needs attention 2:  Suggestions can't work [Fix it]  Voice rooms… [Fix it] │
│ (nothing needs you → one line: "All clear. Every module that's on works.")  │
├ Pulse ─────────────────────────────────────────────────────────────────────┤
│ Members 128 │ Messages 7 d 931 │ Active 7 d 0 │ Mod actions 24 h 0          │
├ Activity ───────────────────────────────────────┬───────────────────────────┤
│ Messages, 14 days (chart, top channels beneath) │ Recent cases              │
├ Modules ────────────┬───────────────────────────┬───────────────────────────┤
│ Security            │ Next raid                 │ Open groups               │
│ Worth turning on …  │                           │                           │
└─────────────────────┴───────────────────────────┴───────────────────────────┘
12 columns: tiles are 3, 8+4 or 4+4+4 wide; a band's tiles share one height.
```

Command reply time moves to Status, where it's about Garrison rather than the server. Health
checks become a line in the Attention band, not a whole panel.

### 9. Four breakpoints

One set of named widths: `--bp-phone` 520, `--bp-tablet` 720 (the menu becomes the sheet),
`--bp-split` 1100 (side column and previews beside), `--bp-wide` 1280 (the "On this page" index).
The 960, 860, 900, 640 and 560 px rules fold into these.

## How to get there

Each phase ships on its own and leaves the dashboard consistent.

**Phase A: quick wins, about a day and a half, no structural change**
1. Say a problem once: the Needs-you strip, banners removed (Voice rooms, Server stats), the
   phone pill wraps.
2. Field width classes (short, medium, long) applied to Settings, Moderation, Security, Leveling,
   Economy and Tickets.
3. Repeating rows at "what's set plus one" (Level rewards, XP boosts, Roles from game stats).
4. Tickets' count strip compact on phones.
5. Intros trimmed to one sentence, with "How this works" for the rest.
6. The menu: pinned server and plan cards, a scrolling list between, 32 px items.

**Phase B: page tabs and the three templates**
- A `PageTabs` component, from the Insights tabs, with each tab as its own route segment.
- `ActivityLayout`, `SetupLayout` (with the "On this page" index and each panel's save state)
  and `CompactLayout`.
- Move pages over, longest first: Moderation, Settings, Security, Welcome, Leveling, Tickets,
  Groups and raids (taking in LFG templates), Economy, Logs, Game accounts.

**Phase C: Compact pages and cleanup**
- Starboard, Suggestions, Voice rooms, Server stats and Invites move to Compact.
- Delete `.page-split--setup`, `.page-split--tools-first` and the three layered `.page-head`
  blocks.
- Library tiles open a full-page editor.

**Phase D: Overview, phones and the menu**
- The four-band Overview.
- The phone head (page bar as the title, search icon).
- The regrouped, foldable menu.
- The four breakpoints.
- DESIGN.md's Layout section rewritten to match, so the rules stay written down.

Each phase is checked the way this audit was: every page captured at 1440 and 390, with the
heights and positions above as the before numbers.

## Decisions for the owner

1. **Page tabs vs one long page with an index.** Recommended: tabs (section 2). The alternative
   keeps every page as one scroll and adds only the sticky "On this page" index. It's less
   change, but Moderation stays 3,600 px and the daily cases stay at the bottom.
2. **Menu groups** (section 6): the names Members, Posts and Support, and moving Settings and
   Plan to the foot.
3. **"Your account" leaves Settings** for the account menu in the top bar, where it already lives.
4. **LFG templates becomes a tab** of Groups and raids, instead of a separate page reached from a
   head button.
5. **Library editors open full page** instead of inside the grid. This is better for long editors
   (role menus, messages) and costs one extra click to get back.

## Appendix: every page, today and proposed

| Page | Today (desktop / phone height) | Proposed |
| --- | --- | --- |
| Overview | 1,759 / 3,164, five row shapes | Four bands (section 8) |
| AI assistant | 1,250 / 1,961, chat + plan | Keep; Server templates moves to a tab |
| Insights | 1,109 / 2,101, tabs | Keep (the model for page tabs) |
| Settings | 3,406 / 5,057, 7 panels | Tabs: General · Access · Garrison's profile · History |
| Moderation | 3,637 / 6,374, 12 panels | Tabs: Cases (Activity) · Automod (Setup) · Appeals and ladder |
| Security | 2,613 / 4,122, 7 panels | Tabs: Now (Activity) · Anti-raid · Verification · Anti-nuke |
| Logs | 990 / 1,572 | Tabs: Events (Activity, full-width table) · Setup |
| Welcome | 2,669 / 4,519, 5 editors | Tabs: Join · Leave · DM, each an editor with its preview |
| Role menus | 946 / 852, library | Library; the tile opens a full-page editor |
| Leveling | 2,556 / 3,794, 6 panels, a hole | Tabs: Leaderboard · Settings · Rank card · Rewards |
| Giveaways | 946 / 911, library | Library |
| Starboard | 946 / 1,121, setup variant | Compact |
| Suggestions | 950 / 1,558, list wide, settings side | Compact (board first on phones) |
| Economy | 2,067 / 2,863, no split | Tabs: Activity · Setup |
| Tickets | 1,664 / 2,359, list wide, settings side | Tabs: Queue · Setup · Panels |
| Messages | 946 / 844, library | Library |
| Stream alerts | 946 / 1,028, library | Library |
| Invites | 946 / 885, one panel | Compact |
| Server stats | 1,127 / 1,518, banner + one panel | Compact, with the Needs-you strip instead of the banner |
| Groups and raids | 1,910 / 2,549, + a separate templates page | Tabs: Groups · Raids · Calendar · Templates |
| LFG templates | 946 / 879, its own page | A tab of Groups and raids |
| Voice rooms | 991 / 1,404, banner + pill | Compact, the Needs-you strip once |
| Game accounts | 1,076 / 1,774 | Tabs: Shared here · Roles from stats |
| Plan | 1,718 / 2,900 | Keep; plans in the same order on phones (Free, Pro, Agency) |
| Search | 946 / 1,152, three result groups | Keep |
| Server list, Account, Status | single column | Keep; Account gains "Your account" from Settings |
