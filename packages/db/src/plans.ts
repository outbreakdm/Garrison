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

/** What a server's AI use is counted under: Agency is Pro from a seat (guild_plans.bundle_id). */
export type AiTier = GuildPlan | "agency";

/** The most changes one AI assistant plan can make. */
export const QM_CHANGES_PER_PLAN = 20;

/**
 * Supplies: the AI assistant's one currency, a monthly pool. A message (a chat message, a
 * plan, a revision) is charged what its AI call really cost, 1 supply per $0.001
 * (ai-usage.ts), so a pool can never cost more than its size in tenths of a cent; a typical
 * message is AI_SUPPLIES_PER_MESSAGE. Every change a plan makes costs AI_SUPPLIES_PER_CHANGE.
 * A drafted plan holds its changes until it's built, discarded or expires.
 *
 * Pro counts per server and renews with its billing period (a month at a time on yearly
 * plans too); Agency is one pool shared by its servers, renewing with its billing period.
 * Free counts per server and also per person across every Free server they ask from, so
 * extra servers don't add free AI, and renews on the 1st (UTC). Worst case (every supply
 * spent on AI, on either model, since a supply is $0.001 of AI whichever runs), a paid pool's
 * AI is at most 39% of what the plan brings in after Stripe, so every plan keeps a margin of
 * at least 59% before hosting (docs/pricing.md, 2026-11-20; it was 52% on yearly plans).
 */
export const AI_SUPPLIES_PER_MONTH = {
  // 100 since 2026-11-20 (from 200): Free brings in nothing, and runs on Fast only.
  free: 100,
  pro: 2500,
  agency: 11_000,
} as const satisfies Record<AiTier, number>;
/** What a typical message costs, for "about N messages". */
export const AI_SUPPLIES_PER_MESSAGE = 3;
export const AI_SUPPLIES_PER_CHANGE = 1;

/**
 * Supply packs: AI supplies a server buys once, used after its monthly pool runs out,
 * oldest first, for SUPPLY_PACK_DAYS. Any server can buy them, Free included. Worst case,
 * a pack's AI is at most 35% of what it brings in after Stripe's fee, a margin of at least
 * 60% (docs/pricing.md). Prices in US dollars.
 */
export const SUPPLY_PACKS = {
  small: { supplies: 800, price: 2.99 },
  large: { supplies: 4000, price: 11.99 },
} as const;
export type SupplyPack = keyof typeof SUPPLY_PACKS;
export const SUPPLY_PACK_DAYS = 365;
/** An unused pack is refunded in full within this many days. */
export const SUPPLY_PACK_REFUND_DAYS = 14;
/** What one full plan costs: the message that drafts it and its 20 changes. */
export const AI_SUPPLIES_PER_FULL_PLAN = AI_SUPPLIES_PER_MESSAGE + QM_CHANGES_PER_PLAN;

/**
 * Member-level permissions the AI assistant may give a new role. Never Administrator,
 * anything that manages, moderates or mentions everyone: those stay a deliberate step in
 * Discord. `flag` is discord.js's PermissionFlagsBits name. Garrison can only grant what it
 * holds itself, so these are also in the invite (packages/brand inviteSettings).
 */
export const QM_ROLE_PERMISSIONS = {
  attach_files: { flag: "AttachFiles", label: "Attach files" },
  embed_links: { flag: "EmbedLinks", label: "Embed links" },
  add_reactions: { flag: "AddReactions", label: "Add reactions" },
  external_emoji: { flag: "UseExternalEmojis", label: "Use external emoji" },
  external_stickers: { flag: "UseExternalStickers", label: "Use external stickers" },
  create_threads: { flag: "CreatePublicThreads", label: "Create threads" },
  send_in_threads: { flag: "SendMessagesInThreads", label: "Talk in threads" },
  stream: { flag: "Stream", label: "Video and screen share" },
  voice_activity: { flag: "UseVAD", label: "Voice activity" },
  change_nickname: { flag: "ChangeNickname", label: "Change nickname" },
} as const;
export type QmRolePermission = keyof typeof QM_ROLE_PERMISSIONS;
export const QM_ROLE_PERMISSION_KEYS = Object.keys(QM_ROLE_PERMISSIONS) as QmRolePermission[];

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
      "Moderation with AI screening, anti-raid, anti-nuke, verification and logs, in full",
      "Every module with the standard look and sensible limits",
      "AI assistant: 100 supplies a month, on Fast",
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
      "AI assistant: 2,500 supplies a month, and server templates",
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
      "AI assistant: 11,000 supplies a month, shared by your servers",
      "One bill: $7.00 a server a month",
    ],
  },
} as const;
export type PlanTier = keyof typeof PRICING;

/** "save 26%": what paying yearly saves against twelve monthly payments. */
export const yearlySaving = (monthly: number, yearly: number) =>
  `save ${Math.round((1 - yearly / (monthly * 12)) * 100)}%`;

/** A price for display, always with cents so prices line up: "$8.99", "$0.00". */
export const formatPrice = (n: number) => `$${n.toFixed(2)}`;

export type Module =
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
  | "qm"
  | "voice"
  | "stats"
  | "invites"
  | "economy"
  | "suggestions"
  | "insights";

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
    about:
      "AI moderation: OpenAI's moderation model reads messages for harassment, hate and more (free to run, so on every plan since 2026-11-20)",
    free: true,
    pro: true,
  },
  "automod.aiTuning": {
    module: "automod",
    about:
      "Choosing what AI moderation looks for and how strict it is (Free uses harassment, hate, sexual content and self-harm, balanced)",
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
  "qm.supplies": {
    module: "qm",
    about:
      "AI assistant supplies a month: a message costs what its AI really uses, on Fast or Smart, and each change a plan makes costs 1 (Agency: 11,000 shared by its servers; Free: 100 per person across all their servers, Fast only)",
    free: AI_SUPPLIES_PER_MONTH.free,
    pro: AI_SUPPLIES_PER_MONTH.pro,
  },
  "rally.templates": {
    module: "rally",
    about: "LFG templates",
    free: 3,
    pro: 25,
  },
  "insights.days": {
    module: "insights",
    about: "How far back server insights go, in days",
    free: 30,
    pro: 365,
  },
  "insights.export": {
    module: "insights",
    about: "Download server insights as a spreadsheet",
    free: false,
    pro: true,
  },
  "suggestions.anonymous": {
    module: "suggestions",
    about: "Anonymous suggestions: cards don't show who posted",
    free: false,
    pro: true,
  },
  "voice.creators": {
    module: "voice",
    about: "Voice channels members join to make their own room",
    free: 1,
    pro: 5,
  },
  "voice.names": {
    module: "voice",
    about: "Your own voice room names, with the owner's name in them",
    free: false,
    pro: true,
  },
  "automod.patterns": {
    module: "automod",
    about: "Patterns (regular expressions) Discord's AutoMod blocks",
    free: 3,
    pro: 10,
  },
  "economy.items": {
    module: "economy",
    about: "Items in the server's shop",
    free: 10,
    pro: 50,
  },
  "economy.extras": {
    module: "economy",
    about: "Earning in voice and at level-ups, and shop roles for a time",
    free: false,
    pro: true,
  },
  "invites.labels": {
    module: "invites",
    about: "Labelled invites: names, colors, categories, partner details and join roles",
    free: 10,
    pro: 100,
  },
  "stats.counters": {
    module: "stats",
    about: "Server stats counters (channels that show a live count)",
    free: 3,
    pro: 10,
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
