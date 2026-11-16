# Economy: a server currency (design)

Request 8 of `docs/COMMUNITY_REQUESTS.md`. Garrison's own design: no gambling, nothing that
touches real money.

**Owner's picks (2026-11-16):** members can pay each other within a daily cap; Free 10 shop
items, Pro 50; "Economy" in the menu, each server naming its own currency.

**Status: built** (not deployed): all four steps below. Needs migration `0071_economy` and a
deploy with **register_commands=true** (new commands: /balance, /daily, /pay, /shop, /buy,
/money, and /leaderboard's "by" option). Still to check on a test server: earning from chat
and /daily, /pay and its cap, buying a role (and the refund when Discord refuses), a staff
item's card with Done and Refund, a timed role taken back, and buying from the Wallet.

## The idea

Each server can run its own currency with its own name and icon ("Crowns 👑", or a server
emoji). Members earn it by taking part, spend it in a shop the staff fill, and see it on their
member page. Staff can give and take with a reason, and every change is on a ledger nobody can
edit, so the numbers can always be explained.

## Earning

- **Chatting:** a few coins per message, at most once a minute per member (the same cooldown
  idea as XP), with the same channel and role rules as Leveling's boosts (a channel can earn
  nothing).
- **Daily:** `/daily` once a day, with a small streak bonus that resets after a missed day.
- **Voice:** coins per ten minutes in voice with at least one other person (not muted alone).
- **Level-ups:** optional coins at each level, so Leveling and the economy feed each other.
- **Staff:** `/money give` and `/money take` with a reason, from Discord or the dashboard.

Each source has its own switch and amount on the dashboard, with recommended values.

## Spending: the shop

Items the staff make on the dashboard, each with a name, price, description and an emoji:

- **A role**, for good or for a time (an hour to 30 days; Garrison takes it back when it ends).
  Never a role with admin or moderation powers, never one above Garrison's own.
- **Something staff hand out** (a custom nickname, a shout-out, an in-game item): buying it
  posts a card to a staff channel with **Done** and **Refund**.
- Optional per item: stock, a limit per member, a role needed to buy.

`/shop` lists them, `/buy` buys one; the member page has the same shop with buttons.

## Seeing it

- **Members:** `/balance`, the leaderboard (`/leaderboard money`), and a **Wallet** on their
  member page: balance, what they bought, their recent history.
- **Staff:** an **Economy** page under Engagement: the currency, earning, the shop with a
  Discord preview, the leaderboard, and the ledger (filter by member, source or item; export on
  Pro).

## Safety

- Whole numbers only; a balance can never go below zero (checked by the database), and every
  change happens in one transaction with the balance row locked, so two purchases at once can't
  both spend the same coins.
- The ledger is append-only for the bot; the dashboard reads it. Staff changes need a reason.
- Rate limits on commands and dashboard requests, like the rest of Garrison.
- No gambling, no betting, no trading for real money, no exchange between servers.

## Plans

| | Free | Pro |
|---|---|---|
| Shop items | 10 | 50 |
| Earning sources | chatting, daily, paying, staff | also voice and level-ups |
| Timed roles in the shop | no | yes |
| Ledger | kept 400 days on both (a Free window and a Pro export are later) | |

## Data

`economy_settings` (a settings module with history: currency, earning, the shop as one list),
`wallets` (guild, member, balance, streak), `economy_ledger` (every change: amount, source,
reason, who), `economy_holds` (timed roles to take back, staff-handled purchases waiting). The
bot writes wallets, ledger and holds; the dashboard reads them and asks the bot to act through
dashboard requests.

## Order

1. Currency, earning from chatting and daily, `/balance`, `/daily`, the leaderboard, staff
   give and take, the ledger.
2. The shop with roles (for good) and staff-handled items, `/shop` and `/buy`.
3. The Wallet on member pages, buying from the dashboard.
4. Voice and level-up earning, timed roles, stock and limits.

