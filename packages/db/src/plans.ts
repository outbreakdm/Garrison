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

type Module =
  | "cards"
  | "roles"
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
    about: "Your own accent colour on cards",
    free: false,
    pro: true,
  },
  "cards.images": {
    module: "cards",
    about: "Banner images and thumbnails on cards",
    free: false,
    pro: true,
  },
  "cards.footer": {
    module: "cards",
    about: "Your own footer on cards, or none",
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
