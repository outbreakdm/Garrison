import { FEATURES, type Module } from "./plans";

/**
 * How Garrison works, one entry per feature: what it does, where it lives in the dashboard,
 * how to set it up, its commands, and what each plan gets. The AI assistant answers how-to
 * questions from this (its garrison_help tool), and the dashboard's Help page shows the same
 * text, so the two never disagree. What each plan gets comes from FEATURES, the limits the
 * code enforces. Keep it to what's built; update an entry when its page changes.
 */

export interface HelpEntry {
  title: string;
  /** The dashboard page, as the menu names it. */
  page: string;
  /** Its path under /servers/<id>, with a tab when it has one ("?tab=automod"). */
  path: string;
  /** What it does, in a sentence or two. */
  about: string;
  /** How to set it up, in order. */
  steps: string[];
  /** Commands in Discord. */
  commands?: string[];
  /** FEATURES modules whose plan limits apply. */
  modules?: Module[];
  /** Words people might use for it. */
  keywords: string;
}

export const HELP = {
  moderation: {
    title: "Moderation",
    page: "Moderation",
    path: "/watch",
    about:
      "Warn, time out, kick and ban, each as a numbered case you can undo (kicks and purges excepted). Members get a DM with the reason and how to appeal.",
    steps: [
      "Moderation → Settings: pick a log channel for every case, and whether members get a DM.",
      "Turn on appeals there to let members appeal on a page of their own; they queue on the Cases tab.",
      "Act from Discord with the commands, or from a member's page on the dashboard.",
    ],
    commands: [
      "/warn",
      "/timeout",
      "/kick",
      "/ban (length: for a temporary ban)",
      "/purge",
      "/case",
      "/history",
      "/note add",
      "/moderation",
    ],
    keywords: "warn timeout kick ban purge case history appeal mod log notes",
  },
  warnings: {
    title: "Warning ladder",
    page: "Moderation",
    path: "/watch",
    about:
      "What happens after a number of warnings: new servers start with 3 warnings in 24 hours → a 1 hour timeout. Each rule fires once as the count reaches it; undone warnings stop counting.",
    steps: ["Moderation → Settings → Escalation: add, change or remove rules."],
    keywords: "escalation ladder warnings strikes punishment automatic",
  },
  automod: {
    title: "Automod",
    page: "Moderation",
    path: "/watch?tab=automod",
    about:
      "Removes messages with blocked words, invites to other servers, scam links, too many mentions or spam, then does nothing more, warns or times out. Staff with Manage Messages and exempt roles or channels are never checked.",
    steps: [
      "Moderation → Automod: switch on the checks you want and add blocked words.",
      "Pick what a hit does (remove only, warn, or time out) and any exempt roles and channels.",
      "AI moderation reads messages for harassment, hate, sexual content and self-harm, on every plan; on Pro you choose what it looks for and how strict it is.",
    ],
    modules: ["automod"],
    keywords: "automod blocked words filter invites links spam mentions scam ai moderation regex",
  },
  security: {
    title: "Anti-raid and lockdown",
    page: "Security",
    path: "/gatehouse?tab=antiraid",
    about:
      "Anti-raid watches the join rate (10 joins in 30 seconds by default), then locks the server and pauses invites for 15 minutes, or only alerts. A lockdown stops @everyone posting while staff roles keep talking, and puts every channel back exactly as it was when it ends. New accounts under 7 days old are flagged on join.",
    steps: [
      "Security → Anti-raid: switch it on, set what counts as a raid and whether it locks or only alerts.",
      "Pick an alert channel and the staff roles that keep talking in a lockdown.",
    ],
    commands: [
      "/lockdown start",
      "/lockdown end",
      "/lockdown status",
      "/security alert_channel",
      "/security staff_role_add",
    ],
    keywords: "anti-raid raid lockdown lock alert new accounts security",
  },
  verification: {
    title: "Verification",
    page: "Security",
    path: "/gatehouse?tab=verification",
    about:
      "A Verify button that gives a role, with an optional minimum account age, so newcomers only see the server once they've verified. It can also send members to a website check with a captcha.",
    steps: [
      "Make a Verified role, and hide your channels from @everyone (the AI assistant can do this for you).",
      "Security → Verification: pick the role and the minimum account age, then post the Verify button in a channel everyone sees.",
    ],
    commands: ["/verify setup"],
    keywords: "verify verification captcha gate newcomers role",
  },
  antinuke: {
    title: "Anti-nuke",
    page: "Security",
    path: "/gatehouse?tab=antinuke",
    about:
      "Watches for a rogue admin or bot: 3 channel or role deletions, or 5 bans and kicks, by one person within 60 seconds gets their roles removed and an alert with Restore roles. Giving @everyone a dangerous permission is undone at once. Only the server owner can change it, so a compromised admin can't switch it off first.",
    steps: [
      "As the owner: Security → Anti-nuke, switch it on and add trusted people.",
      "Keep Garrison's role at the top of the role list, or it can't remove roles above it.",
    ],
    commands: ["/security anti_nuke (owner only)"],
    keywords: "anti-nuke nuke rogue admin quarantine trusted owner",
  },
  backups: {
    title: "Backups",
    page: "Security",
    path: "/gatehouse",
    about:
      "A snapshot of roles, categories, channels and their permissions. Restore (owner only) recreates only what's missing, never deletes or edits what's there.",
    steps: ["Security → Back up now. On Pro, a backup is taken every week by itself."],
    modules: ["backups"],
    keywords: "backup restore snapshot",
  },
  logs: {
    title: "Logs",
    page: "Logs",
    path: "/ledger",
    about:
      "Who did what, when: joins and leaves, bans and timeouts, role, nickname, channel and permission changes, invites, deleted messages and voice moves. Kept 30 days by default (7 to 365).",
    steps: [
      "Logs → Settings: pick a log channel and how long events are kept.",
      "Turn on keeping the text of deleted and edited messages if you want it (off by default).",
    ],
    commands: ["/logs settings", "/logs search user:@member"],
    modules: ["ledger"],
    keywords: "logs audit ledger events history deleted messages joins leaves",
  },
  welcome: {
    title: "Welcome",
    page: "Welcome",
    path: "/herald",
    about:
      "A card when someone joins and when they leave, an optional DM, and roles given on join.",
    steps: [
      "Welcome: switch on the join card and pick its channel; write its text in the card editor.",
      "Add the roles new members get, and switch on the leave card or the DM if you want them.",
    ],
    modules: ["welcome"],
    keywords: "welcome greet join leave goodbye dm autorole join roles card",
  },
  "role-menus": {
    title: "Role menus",
    page: "Role menus",
    path: "/insignia",
    about:
      "Cards in Discord with buttons or a dropdown, so members pick their own roles (games, pings, pronouns, colors).",
    steps: [
      "Role menus → New menu: add the roles, pick buttons or a dropdown, and design the card.",
      "Post it in a channel (or ask the AI assistant to post it).",
    ],
    modules: ["roles"],
    keywords: "role menu self roles reaction roles pick roles buttons dropdown",
  },
  tickets: {
    title: "Tickets and modmail",
    page: "Tickets",
    path: "/parley",
    about:
      "A panel with one button per topic opens a private channel for the member and your staff roles, with its transcript kept. Modmail lets members open one by DMing Garrison.",
    steps: [
      "Tickets → Panels: make a panel, its topics and the staff roles who see tickets.",
      "Post the panel in a channel (or ask the AI assistant to). Turn on modmail in Tickets settings if you want it.",
      "With Pro, staff run /ticket assist in a ticket: Bastion reads it and your tags, and privately drafts a summary and a reply, using a few supplies.",
    ],
    commands: ["/ticket close", "/ticket claim", "/ticket assist", "/ticket add", "/ticket remove"],
    modules: ["tickets"],
    keywords: "tickets support modmail help desk panel transcript",
  },
  applications: {
    title: "Applications",
    page: "Applications",
    path: "/applications",
    about:
      "Recruitment and staff forms: a panel's Apply button opens Discord's form, the answers go to your staff channel with Accept and Decline, and accepting gives the form's roles.",
    steps: [
      "Applications → New form: name it, write the panel, add up to five questions, pick the staff channel and the roles accepting gives.",
      "Post its panel in a channel. Staff accept or decline on the card in Discord or under Waiting for staff; the applicant gets a DM either way.",
      "Free runs one form, Pro up to ten. Applications are kept 90 days.",
    ],
    modules: ["applications"],
    keywords: "applications apply recruitment recruit form staff application guild join team",
  },
  leveling: {
    title: "Leveling",
    page: "Leveling",
    path: "/ranks",
    about:
      "Members earn XP for chatting (15 to 25 a minute at most) and, if you turn it on, for voice. Level-ups are announced where they happened, in one channel, or not at all. Reward roles are given at levels.",
    steps: [
      "Leveling → Settings: switch it on and pick where level-ups go.",
      "Add reward roles for levels. On Pro, design the rank card and add XP boosts or seasons.",
    ],
    commands: ["/rank", "/leaderboard", "/rankcard", "/ranks settings", "/ranks reward"],
    modules: ["ranks"],
    keywords: "leveling levels xp rank leaderboard rewards rank card seasons boosts",
  },
  starboard: {
    title: "Starboard",
    page: "Starboard",
    path: "/honors",
    about:
      "A message that collects enough of one emoji (3 ⭐ by default) is reposted to a channel of its own.",
    steps: ["Starboard: switch it on, pick the channel, the emoji and how many it takes."],
    modules: ["starboard"],
    keywords: "starboard stars hall of fame best messages",
  },
  suggestions: {
    title: "Suggestions",
    page: "Suggestions",
    path: "/suggestions",
    about:
      "Members post ideas with /suggest; each becomes a card people vote on, and staff mark it planned, done or declined.",
    steps: ["Suggestions: switch it on and pick the channel for cards."],
    commands: ["/suggest"],
    modules: ["suggestions"],
    keywords: "suggestions ideas feedback vote",
  },
  "stream-alerts": {
    title: "Stream alerts",
    page: "Stream alerts",
    path: "/beacon",
    about:
      "A post when a Twitch channel goes live or a YouTube channel posts a video, optionally pinging one role.",
    steps: [
      "Stream alerts → Add alert: the Twitch or YouTube channel, where to post, and the role to ping.",
    ],
    modules: ["alerts"],
    keywords: "stream alerts twitch youtube live notifications streamer kick",
  },
  messages: {
    title: "Messages",
    page: "Messages",
    path: "/dispatch",
    about:
      "Announcements, rules and reminders as cards, posted now or on a schedule; and auto-responders: Garrison answers a word or a phrase, or posts a tag with /tag.",
    steps: [
      "Messages → New message: write it in the card editor, then post it now or schedule it.",
      "Messages → Auto-responders and tags → Add a responder: pick a word, a phrase or a /tag name, write the reply, and optionally the channels and a wait between replies.",
      "Free keeps 10 responders and tags, Pro 100.",
    ],
    modules: ["messages"],
    keywords:
      "messages announcements embeds rules schedule reminders post auto-responder autoresponder trigger custom command tag tags faq reply",
  },
  giveaways: {
    title: "Giveaways",
    page: "Giveaways",
    path: "/spoils",
    about: "A prize with an Enter button; Garrison draws the winners when time's up.",
    steps: ["Giveaways → New giveaway: the prize, 1 to 20 winners, how long, and the channel."],
    commands: ["/giveaway start", "/giveaway end", "/giveaway reroll", "/giveaway cancel"],
    modules: ["giveaways"],
    keywords: "giveaway prize raffle draw winners",
  },
  "groups-raids": {
    title: "Groups and raids",
    page: "Groups and raids",
    path: "/rally",
    about:
      "LFG cards members join (with a private voice channel when the squad fills), and raid rosters with sign-ups by role, a bench and reminders. Members can also join from the website.",
    steps: [
      "Groups and raids: set the server's time zone, then make LFG templates for your games.",
      "Members post groups with /lfg create; staff schedule raids with /raid create.",
    ],
    commands: [
      "/lfg create",
      "/lfg list",
      "/lfg close",
      "/raid create",
      "/raid list",
      "/raid timezone",
    ],
    modules: ["rally", "ops"],
    keywords: "lfg looking for group squad raid roster signups events calendar attendance",
  },
  "voice-rooms": {
    title: "Voice rooms",
    page: "Voice rooms",
    path: "/voice",
    about:
      "Join-to-create voice channels: joining one makes a room of your own, removed when it empties.",
    steps: [
      "Voice rooms: switch it on and pick the voice channels that make rooms, and the category they go in.",
    ],
    modules: ["voice"],
    keywords: "voice rooms join to create temp voice channels",
  },
  economy: {
    title: "Economy",
    page: "Economy",
    path: "/economy",
    about:
      "Your server's own currency, earned by chatting, a daily claim and more, and spent in your shop.",
    steps: ["Economy: name the currency, choose how it's earned, and add items to the shop."],
    commands: ["/balance", "/daily", "/pay", "/shop", "/buy", "/money", "/leaderboard"],
    modules: ["economy"],
    keywords: "economy coins currency shop daily balance",
  },
  invites: {
    title: "Invites",
    page: "Invites",
    path: "/invites",
    about:
      "Every invite to the server, who it brings and how many stay; label invites and give roles to whoever joins through one.",
    steps: ["Invites: label an invite (a name, color or partner) and pick roles it gives on join."],
    modules: ["invites"],
    keywords: "invites tracking inviter partners invite roles",
  },
  "server-stats": {
    title: "Server stats",
    page: "Server stats",
    path: "/stats",
    about: "Voice channels named with a live count, like “Members: 372”.",
    steps: ["Server stats → Add a counter: what it counts (members, bots, a role) and its name."],
    modules: ["stats"],
    keywords: "server stats counters member count",
  },
  "game-accounts": {
    title: "Game accounts",
    page: "Game accounts",
    path: "/barracks",
    about:
      "Members share their game accounts with /link (verified from Discord Connections or Battle.net, or claimed for RuneScape). On Pro, roles follow game stats.",
    steps: [
      "Members run /link in the server. On Pro, Game accounts → Roles: add rules like “OSRS total level 2000+ → @Maxed”.",
    ],
    commands: ["/link", "/unlink", "/roster"],
    modules: ["barracks"],
    keywords: "game accounts link steam battle.net riot osrs runescape roster",
  },
  insights: {
    title: "Insights",
    page: "Insights",
    path: "/insights",
    about:
      "How the server is doing: active members, messages, joins and leaves, who stays, the busiest hours and channels.",
    steps: ["Open Insights. Someone with Manage Server can share it as a read-only link."],
    modules: ["insights"],
    keywords: "insights analytics stats growth activity",
  },
  "ai-assistant": {
    title: "AI assistant",
    page: "AI assistant",
    path: "/quartermaster",
    about:
      "Describe what you need in plain words; the assistant drafts it (channels, roles, permissions, order, some settings and posts), you see every change in Your server, and nothing happens until you apply it. Every build can be undone. It runs on Bastion v1, Garrison's AI engine: Fast (every plan) or Smart (Pro), each costing supplies at its real price; changes you make by hand are free.",
    steps: [
      "Ask in the chat, or rename and drag in Your server.",
      "Review the changes, then Apply. Undo any build from History.",
    ],
    commands: ["/qm build", "/qm history", "/qm undo"],
    modules: ["qm"],
    keywords: "ai assistant quartermaster build supplies smart fast templates",
  },
  plan: {
    title: "Plans and billing",
    page: "Plan",
    path: "/plan",
    about:
      "What this server has and what Pro adds; staying safe is free on every plan. Billing and supply packs are there too.",
    steps: [
      "Plan: compare Free and Pro, subscribe, or buy supply packs. Only the person who pays can change billing.",
    ],
    keywords: "plan pro billing subscription price upgrade supplies packs cancel",
  },
  access: {
    title: "Dashboard access",
    page: "Settings",
    path: "/settings?tab=access",
    about:
      "Who besides people with Manage Server can open this dashboard, and as viewer, editor or manager.",
    steps: ["Settings → Access: add a person or a role and pick what they can do."],
    keywords: "dashboard access permissions editor manager viewer staff",
  },
  "bot-profile": {
    title: "Garrison's profile",
    page: "Settings",
    path: "/settings?tab=profile",
    about: "How Garrison looks in your server: on Pro, its own avatar, banner and bio.",
    steps: ["Settings → Garrison's profile."],
    modules: ["profile"],
    keywords: "bot profile nickname avatar banner bio",
  },
  health: {
    title: "Health check",
    page: "Overview",
    path: "",
    about:
      "Checks Garrison's permissions for each feature, its role position, and the log and alert channels. Fix permissions re-invites Garrison with exactly what it needs.",
    steps: ["Run /health, or see the checks on the Overview."],
    commands: ["/health"],
    keywords: "health permissions fix role position missing access",
  },
} satisfies Record<string, HelpEntry>;

export type HelpTopic = keyof typeof HELP;
export const HELP_TOPICS = Object.keys(HELP) as HelpTopic[];

/** What each plan gets for a feature, from the limits the code enforces. */
export function helpPlanLines(entry: HelpEntry): string[] {
  const value = (v: unknown) => (v === true ? "yes" : v === false ? "no" : String(v));
  return Object.values(
    FEATURES as Record<string, { module: Module; about: string; free: unknown; pro: unknown }>,
  )
    .filter((f) => entry.modules?.includes(f.module))
    .map((f) => `${f.about}: Free ${value(f.free)}, Pro ${value(f.pro)}`);
}

/** One entry as plain text, for the assistant's tool. */
export function helpText(topic: HelpTopic): string {
  const e: HelpEntry = HELP[topic];
  const plan = helpPlanLines(e);
  return [
    `${e.title} (${e.page} page)`,
    e.about,
    `How to set it up:\n${e.steps.map((s) => `- ${s}`).join("\n")}`,
    e.commands?.length ? `Commands: ${e.commands.join(", ")}` : "",
    plan.length ? `Free and Pro:\n${plan.map((l) => `- ${l}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
