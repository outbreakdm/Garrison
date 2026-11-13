/**
 * Garrison's plans, and the one list of everything they gate.
 *
 * If a limit or feature isn't a key in FEATURES, it isn't paywalled. The bot, the
 * dashboard, the pricing table and the staff page all read this list, so a new gate
 * starts here. Rule: everything a server needs to stay safe is free; Pro sells
 * customization, branding, scale and history. See docs/ROADMAP.md.
 */

export const PLANS = ["free", "pro"] as const;
export type GuildPlan = (typeof PLANS)[number];

/**
 * What each plan costs and the few lines that sell it. One place for every price: the
 * landing page, the Plan page and the account page read this. Agency is Pro on up to
 * `servers` servers under one subscription (plan_bundles); see docs/pricing.md.
 */
export const PRICING = {
  free: {
    name: "Free",
    monthly: 0,
    yearly: 0,
    servers: null,
    pitch: "Everything a server needs to stay safe, and every module to try.",
    highlights: [
      "Moderation, anti-raid, anti-nuke, verification and logs, in full",
      "Every module with the standard look and sensible limits",
      "3 AI builder plans a day",
      "Undo and history on every change",
    ],
  },
  pro: {
    name: "Pro",
    monthly: 8.99,
    yearly: 79.99,
    servers: 1,
    pitch: "Your server's own look, higher limits and history. Replaces three or four paid bots.",
    highlights: [
      "Branded cards: your colors, images, emoji and footer",
      "Ticket forms, auto-assign, stats and a year of transcripts",
      "Custom rank cards, XP boosts and seasons",
      "Raid attendance, roles from game stats, scheduled backups",
      "15 AI builder plans a day and server templates",
    ],
  },
  agency: {
    name: "Agency",
    monthly: 34.99,
    yearly: 349.99,
    servers: 5,
    pitch: "Pro on up to 5 servers you run, under one subscription. Move a seat any time.",
    highlights: [
      "Everything in Pro, on each of 5 servers",
      "Put a server in a seat, or free it, from its Plan page",
      "15 AI builder plans a day on each server",
      "One bill: $7.00 a server a month",
    ],
  },
} as const;
export type PlanTier = keyof typeof PRICING;

/**
 * False until Stripe checkout works end to end: pages show prices as "at launch" and
 * nothing can be bought. Until then plans are given only by staff (comps).
 */
export const PAID_PLANS_LIVE = false;

/** "save 26%": what paying yearly saves against twelve monthly payments. */
export const yearlySaving = (monthly: number, yearly: number) =>
  `save ${Math.round((1 - yearly / (monthly * 12)) * 100)}%`;

/** A price for display, always with cents so prices line up: "$8.99", "$0.00". */
export const formatPrice = (n: number) => `$${n.toFixed(2)}`;

type Module =
  | "cards"
  | "messages"
  | "profile"
  | "roles"
  | "welcome"
  | "tickets"
  | "alerts"
  | "giveaways"
  | "starboard"
  | "automod"
  | "backups"
  | "ledger"
  | "rally"
  | "ops"
  | "ranks"
  | "watch"
  | "gatehouse"
  | "ledger"
  | "barracks"
  | "qm";

interface Feature<T> {
  module: Module;
  /** What the key controls, in plain words, for the Plan page and pricing table. */
  about: string;
  free: T;
  pro: T;
}

/** Only gates the code enforces today. Planned ones live in docs/ROADMAP.md until built. */
export const FEATURES = {
  // Every card Garrison posts from the card editor (role menus first).
  "cards.accent": {
    module: "cards",
    about: "Your own accent color on cards",
    free: false,
    pro: true,
  },
  "cards.images": {
    module: "cards",
    about: "Banner images and thumbnails on cards",
    free: false,
    pro: true,
  },
  "cards.embed": {
    module: "cards",
    about: "Embed extras on cards: an author line, a linked title and name and value fields",
    free: false,
    pro: true,
  },
  "cards.footer": {
    module: "cards",
    about: "Your own footer on cards, or none",
    free: false,
    pro: true,
  },
  "emoji.custom": {
    module: "cards",
    about: "Your server's own emoji in role menus, ticket panels and the starboard",
    free: false,
    pro: true,
  },
  "messages.scheduled": {
    module: "messages",
    about: "Scheduled messages",
    free: 3,
    pro: 50,
  },
  "messages.extras": {
    module: "messages",
    about: "Repeating schedules and link buttons on messages",
    free: false,
    pro: true,
  },
  "profile.identity": {
    module: "profile",
    about: "Garrison's own avatar, banner and bio in your server",
    free: false,
    pro: true,
  },
  "roles.menus": {
    module: "roles",
    about: "Role menus",
    free: 3,
    pro: 25,
  },
  "roles.limits": {
    module: "roles",
    about: "Limit picks per menu (up to 2, 3…) and require a role to use a menu",
    free: false,
    pro: true,
  },
  "welcome.dm": {
    module: "welcome",
    about: "A welcome DM to each new member",
    free: false,
    pro: true,
  },
  "welcome.image": {
    module: "welcome",
    about: "A welcome image with the new member's avatar and name",
    free: false,
    pro: true,
  },
  "welcome.roles": {
    module: "welcome",
    about: "Roles given on join",
    free: 1,
    pro: 5,
  },
  "tickets.panels": {
    module: "tickets",
    about: "Ticket panels",
    free: 1,
    pro: 10,
  },
  "tickets.topics": {
    module: "tickets",
    about: "Topics on each ticket panel",
    free: 3,
    pro: 10,
  },
  "tickets.forms": {
    module: "tickets",
    about: "Questions a member answers before a ticket opens",
    free: false,
    pro: true,
  },
  "tickets.autoAssign": {
    module: "tickets",
    about: "Hand each new ticket to the staff member with the fewest open",
    free: false,
    pro: true,
  },
  "tickets.historyDays": {
    module: "tickets",
    about: "Days a closed ticket's transcript is kept",
    free: 30,
    pro: 365,
  },
  "tickets.stats": {
    module: "tickets",
    about: "Ticket stats: opened, closed and time to first reply",
    free: false,
    pro: true,
  },
  "ranks.cards": {
    module: "ranks",
    about: "Rank cards with your background, color, and details members fill in",
    free: false,
    pro: true,
  },
  "alerts.feeds": {
    module: "alerts",
    about: "Stream and video alerts",
    free: 3,
    pro: 25,
  },
  "alerts.custom": {
    module: "alerts",
    about: "Your own alert message and color",
    free: false,
    pro: true,
  },
  "giveaways.running": {
    module: "giveaways",
    about: "Giveaways running at once",
    free: 2,
    pro: 20,
  },
  "giveaways.rules": {
    module: "giveaways",
    about: "Giveaway entry rules (a role or a level), bonus entries, repeating and your own color",
    free: false,
    pro: true,
  },
  "starboard.look": {
    module: "starboard",
    about: "Your own starboard color",
    free: false,
    pro: true,
  },
  "automod.words": {
    module: "automod",
    about: "Blocked words in automod",
    free: 25,
    pro: 250,
  },
  "automod.ai": {
    module: "automod",
    about: "AI moderation: OpenAI's moderation model reads messages for harassment, hate and more",
    free: false,
    pro: true,
  },
  "backups.kept": {
    module: "backups",
    about: "Server backups kept (roles, channels and permissions)",
    free: 1,
    pro: 30,
  },
  "backups.weekly": {
    module: "backups",
    about: "A server backup every week, taken by itself",
    free: false,
    pro: true,
  },
  "ledger.export": {
    module: "ledger",
    about: "Download the event log as a CSV file",
    free: false,
    pro: true,
  },
  "ops.attendance": {
    module: "ops",
    about: "Attendance: who showed up to raids and groups, and each member's reliability",
    free: false,
    pro: true,
  },
  "ranks.boosts": {
    module: "ranks",
    about: "XP boosts by role, channel or category, and channels with no XP",
    free: false,
    pro: true,
  },
  "ranks.seasons": {
    module: "ranks",
    about: "Seasons: reset the leaderboard and keep each season's final standings",
    free: false,
    pro: true,
  },
  "barracks.statRoles": {
    module: "barracks",
    about: "Roles that follow game stats, like OSRS total level or WoW character level",
    free: false,
    pro: true,
  },
  "qm.templates": {
    module: "qm",
    about: "Server templates: save a server's layout and copy it into another server you own",
    free: false,
    pro: true,
  },
  "qm.dailyCredits": {
    module: "qm",
    about: "Quartermaster plans a day (each plan or change asked for uses one)",
    free: 3,
    pro: 15,
  },
  "rally.templates": {
    module: "rally",
    about: "LFG templates",
    free: 3,
    pro: 25,
  },
  "rally.notifyRole": {
    module: "rally",
    about: "Notify a role when a group is posted",
    free: false,
    pro: true,
  },
} satisfies Record<string, Feature<number> | Feature<boolean>>;

export type FeatureKey = keyof typeof FEATURES;
export type Entitlements = { [K in FeatureKey]: (typeof FEATURES)[K]["free"] };

/**
 * What a server on this plan can do. Plans belong to servers, not people: the
 * owner bypass is staff giving a server Pro for free (plan_set_comp), so the bot
 * and dashboard always agree on what a server has.
 */
export function entitlements(plan: GuildPlan): Entitlements {
  return Object.fromEntries(
    Object.entries(FEATURES).map(([key, feature]) => [key, feature[plan]]),
  ) as Entitlements;
}
