import {
  ALERT_PROVIDER_LIST,
  ALERT_PROVIDERS,
  type AlertFeed,
  checkAlertFeeds,
  normalizeHandle,
  readAlertFeeds,
} from "./alerts";
import { AUTOMOD_LIMITS, checkAutomod, readAutomod } from "./automod";
import type { Db } from "./client";
import { checkEconomy, readEconomy } from "./economy";
import { newId } from "./ids";
import { checkInviteLabels, type InviteLabel, inviteCode, readInviteLabels } from "./invite-labels";
import { readMessages } from "./messages";
import { type Entitlements, FEATURES } from "./plans";
import { PUBLIC_ABOUT_MAX } from "./public-page";
import { checkTemplates, DEFAULT_WORDING } from "./rally";
import { RANK_BACKGROUNDS } from "./rank-cards";
import { readSettings } from "./repo/settings";
import { readRoleMenus } from "./role-menus";
import type { QmPost, QmSettingChange, SettingsModule } from "./schema";
import { checkServerStats, readServerStats, STAT_KINDS } from "./server-stats";
import { checkStarboard, readStarboard, STARBOARD_LIMITS } from "./starboard";
import { checkSuggestions, readSuggestions } from "./suggestions";
import { checkTicketOptions, readTicketConfig, readTicketPanels, TICKET_LIMITS } from "./tickets";
import { UTILITY_LIMITS } from "./utilities";
import { checkVoiceRooms, readVoiceRooms, VOICE_LIMITS } from "./voice-rooms";
import {
  checkWelcome,
  readWelcome,
  WELCOME_IMAGE_BOTTOM,
  WELCOME_IMAGE_LINE_MAX,
  WELCOME_IMAGE_TOP,
} from "./welcome";

/**
 * The settings the AI assistant may change, and how each is checked (docs/AI_ASSISTANT.md,
 * phase 3). A subset of EDITABLE_FIELDS: modules whose checks are shared with the dashboard,
 * or simple enough to check here. Everything else stays on its dashboard page, and anti-nuke
 * is never here. Each field a plan changes costs one supply, like a channel or a role.
 */
type Kind =
  | "bool"
  | "int"
  | "text"
  | "enum"
  | "words"
  | "emoji"
  | "textChannel"
  | "textChannels"
  | "voiceChannels"
  | "category"
  | "role"
  | "roles"
  /** Roles that name who handles something (staff): ones with moderation powers are fine. */
  | "staffRoles"
  | "ladder"
  | "rewards"
  | "timezone"
  | "currency"
  | "alertFeeds"
  | "shopItems"
  | "lfgTemplates"
  | "inviteLabels"
  | "statCounters";

interface FieldSpec {
  label: string;
  kind: Kind;
  /** What it does, for the model. */
  about: string;
  options?: readonly string[];
  min?: number;
  max?: number;
}

interface ModuleSpec {
  label: string;
  fields: Record<string, FieldSpec>;
}

const on = (about: string): FieldSpec => ({ label: "On", kind: "bool", about });

/** The warning ladder's choices, as the Moderation page offers them (settings-schema.ts). */
export const QM_LADDER = {
  steps: 5,
  windows: [60, 360, 1440, 10080, 43200],
  durations: [600, 3600, 21600, 86400, 604800, 2419200],
} as const;
const REWARDS_MAX = 10;
/** The most new items one field adds in one plan (alerts, shop items, templates, labels, counters). */
export const QM_ADD_MAX = 5;

export const QM_SETTINGS = {
  suggestions: {
    label: "Suggestions",
    fields: {
      enabled: on("members post ideas with /suggest and vote on them; needs channelId"),
      channelId: { label: "Channel", kind: "textChannel", about: "where suggestions are posted" },
      anonymous: { label: "Anonymous", kind: "bool", about: "Pro: cards don't show who posted" },
    },
  },
  starboard: {
    label: "Starboard",
    fields: {
      enabled: on("messages with enough reactions are reposted; needs channelId"),
      channelId: { label: "Channel", kind: "textChannel", about: "where starred messages go" },
      emoji: { label: "Emoji", kind: "emoji", about: "one emoji, like ⭐" },
      threshold: {
        label: "Reactions needed",
        kind: "int",
        about: "reactions a message needs",
        min: 1,
        max: STARBOARD_LIMITS.threshold,
      },
      selfStar: {
        label: "Count own star",
        kind: "bool",
        about: "the author's own reaction counts",
      },
      ignoredChannelIds: {
        label: "Ignored channels",
        kind: "textChannels",
        about: "channels that never reach the board",
      },
    },
  },
  voice: {
    label: "Voice rooms",
    fields: {
      enabled: on("joining a creator channel makes the member their own voice room"),
      creatorChannelIds: {
        label: "Creator channels",
        kind: "voiceChannels",
        about: "voice channels that make a room when joined (Free: 1)",
      },
      nameTemplate: {
        label: "Room name",
        kind: "text",
        about: 'Pro: like "Squad of {user}"; null for the standard name',
      },
      userLimit: {
        label: "Member limit",
        kind: "int",
        about: "0 for no limit",
        min: 0,
        max: VOICE_LIMITS.userLimit,
      },
      categoryId: {
        label: "Category",
        kind: "category",
        about: "where rooms go; null for the creator channel's category",
      },
    },
  },
  automod: {
    label: "Automod",
    fields: {
      enabled: on("removes messages that break the rules below"),
      scamLinks: {
        label: "Scam links",
        kind: "bool",
        about: "remove known scam and phishing links",
      },
      invites: { label: "Invites", kind: "bool", about: "remove invites to other servers" },
      aiEnabled: {
        label: "AI moderation",
        kind: "bool",
        about:
          "OpenAI's moderation model also reads messages for harassment, hate, sexual content and self-harm (every plan; Pro chooses what it looks for)",
      },
      mentionLimit: {
        label: "Mention limit",
        kind: "int",
        about: "most mentions in one message; 0 for no limit",
        min: 0,
        max: AUTOMOD_LIMITS.mentionLimit,
      },
      spamCount: {
        label: "Spam count",
        kind: "int",
        about: "messages within spamSeconds that count as spam; 0 for off",
        min: 0,
        max: AUTOMOD_LIMITS.spamCount,
      },
      spamSeconds: {
        label: "Spam window",
        kind: "int",
        about: "seconds",
        min: 2,
        max: AUTOMOD_LIMITS.spamSeconds,
      },
      words: { label: "Blocked words", kind: "words", about: "the whole list (Free: up to 10)" },
      action: {
        label: "Then",
        kind: "enum",
        about: "what else happens to the author",
        options: ["delete", "warn", "timeout"],
      },
      timeoutMinutes: {
        label: "Timeout",
        kind: "int",
        about: "minutes, when action is timeout",
        min: 1,
        max: AUTOMOD_LIMITS.timeoutMinutes,
      },
      exemptRoleIds: { label: "Exempt roles", kind: "roles", about: "roles automod ignores" },
      exemptChannelIds: {
        label: "Exempt channels",
        kind: "textChannels",
        about: "channels automod ignores",
      },
    },
  },
  welcome: {
    label: "Welcome",
    fields: {
      joinEnabled: on("post a welcome card when someone joins; needs joinChannelId"),
      joinChannelId: { label: "Welcome channel", kind: "textChannel", about: "for welcome cards" },
      leaveEnabled: {
        label: "Leave card",
        kind: "bool",
        about: "post a card when someone leaves; needs leaveChannelId",
      },
      leaveChannelId: { label: "Leave channel", kind: "textChannel", about: "for leave cards" },
      dmEnabled: { label: "Welcome DM", kind: "bool", about: "Pro: DM new members a welcome" },
      joinRoleIds: {
        label: "Roles on join",
        kind: "roles",
        about: "given to everyone who joins (Free: 1)",
      },
      joinImage: {
        label: "Welcome image",
        kind: "enum",
        about:
          "Pro: a drawn image of the new member (avatar, name, lines below) on this background; off for none. A server's own picture is set on the dashboard",
        options: ["off", ...Object.keys(RANK_BACKGROUNDS)],
      },
      joinImageAlone: {
        label: "Image on its own",
        kind: "bool",
        about:
          "Pro: the welcome image is the whole message, with no card; false puts it in the card",
      },
      joinImagePing: {
        label: "Mention with the image",
        kind: "bool",
        about: "with the image on its own, mention the new member above it",
      },
      joinImageTop: {
        label: "Image top line",
        kind: "text",
        about: `Pro: drawn above their name, in capitals, ${WELCOME_IMAGE_LINE_MAX} characters at most; {server}, {name} and {count} work; null for "${WELCOME_IMAGE_TOP}"`,
      },
      joinImageBottom: {
        label: "Image bottom line",
        kind: "text",
        about: `Pro: drawn under their name; null for "${WELCOME_IMAGE_BOTTOM}"`,
      },
    },
  },
  ranks: {
    label: "Leveling",
    fields: {
      enabled: on("members earn XP for chatting and level up"),
      voiceXp: {
        label: "Voice XP",
        kind: "bool",
        about: "members also earn XP in voice, with someone else listening",
      },
      announce: {
        label: "Level-ups",
        kind: "enum",
        about: "where level-up messages go",
        options: ["off", "same_channel", "channel"],
      },
      announceChannelId: {
        label: "Level-up channel",
        kind: "textChannel",
        about: "when announce is channel",
      },
    },
  },
  ledger: {
    label: "Logs",
    fields: {
      channelId: {
        label: "Log channel",
        kind: "textChannel",
        about: "where server events (joins, edits, deletes) are logged; null for off",
      },
      retentionDays: {
        label: "Keep events for",
        kind: "int",
        about: "days",
        min: 7,
        max: 365,
      },
      keepMessageText: {
        label: "Keep message text",
        kind: "bool",
        about: "log the text of edited and deleted messages",
      },
    },
  },
  watch: {
    label: "Moderation",
    fields: {
      appealsEnabled: {
        label: "Appeals",
        kind: "bool",
        about: "members with an active case can appeal on a page of their own",
      },
      logChannelId: {
        label: "Mod log",
        kind: "textChannel",
        about: "where warnings, timeouts, kicks and bans are logged",
      },
      dmMembers: { label: "DM members", kind: "bool", about: "tell members when they're punished" },
    },
  },
  gatehouse: {
    label: "Security",
    fields: {
      antiRaidEnabled: on("watches the join rate and acts on a raid"),
      raidJoinCount: {
        label: "Raid joins",
        kind: "int",
        about: "joins within raidWindowSeconds that count as a raid",
        min: 3,
        max: 200,
      },
      raidWindowSeconds: {
        label: "Raid window",
        kind: "int",
        about: "seconds the joins are counted over",
        min: 5,
        max: 600,
      },
      raidResponse: {
        label: "On a raid",
        kind: "enum",
        about: "lockdown locks the server and pauses invites; alert only warns staff",
        options: ["lockdown", "alert"],
      },
      autoUnlockMinutes: {
        label: "Auto-unlock",
        kind: "int",
        about: "minutes before a raid lockdown lifts by itself; 0 waits for staff",
        min: 0,
        max: 1440,
      },
      flagAccountAgeDays: {
        label: "Flag new accounts",
        kind: "int",
        about: "joins from accounts younger than this many days are flagged; 0 is off",
        min: 0,
        max: 365,
      },
      alertChannelId: {
        label: "Alert channel",
        kind: "textChannel",
        about: "where raid and security alerts go",
      },
      staffRoleIds: {
        label: "Staff roles",
        kind: "staffRoles",
        about:
          "roles that keep talking during a lockdown (10 at most); moderator roles belong here",
      },
      verifyRoleId: {
        label: "Verified role",
        kind: "role",
        about: "the role the Verify button gives; no admin or moderation powers",
      },
      verifyMinAccountAgeDays: {
        label: "Verify account age",
        kind: "int",
        about: "accounts younger than this many days can't verify; 0 for any",
        min: 0,
        max: 365,
      },
      verifyWeb: {
        label: "Verify on the website",
        kind: "bool",
        about: "the Verify button sends members to a website check with a captcha",
      },
      backupWeekly: {
        label: "Weekly backups",
        kind: "bool",
        about: "Pro: a backup of roles and channels every week",
      },
    },
  },
  ops: {
    label: "Groups and raids",
    fields: {
      timezone: {
        label: "Time zone",
        kind: "timezone",
        about: 'the server\'s time zone for raids and schedules, like "America/Chicago"',
      },
      trackAttendance: {
        label: "Track attendance",
        kind: "bool",
        about: "Pro: count who shows up to raids and groups from voice",
      },
    },
  },
  escalation: {
    label: "Warning ladder",
    fields: {
      rules: {
        label: "Ladder",
        kind: "ladder",
        about: `the whole ladder, replacing it: up to ${QM_LADDER.steps} steps of { warnCount 1-50, windowMinutes (one of ${QM_LADDER.windows.join(", ")}), action timeout|kick|ban, durationSeconds (timeout only: one of ${QM_LADDER.durations.join(", ")}; else null) }, each with a different warnCount`,
      },
    },
  },
  rewards: {
    label: "Level rewards",
    fields: {
      rewards: {
        label: "Rewards",
        kind: "rewards",
        about:
          "every reward, replacing them: up to 10 of { level 1-500, roleId } with different levels; roles without admin or moderation powers, existing or made by this plan",
      },
    },
  },
  alerts: {
    label: "Stream alerts",
    fields: {
      feeds: {
        label: "New alerts",
        kind: "alertFeeds",
        about: `alerts to add (the saved ones stay): up to ${QM_ADD_MAX} of { provider twitch|kick|youtube|reddit|bluesky|rss, handle (a Twitch or Kick username, a YouTube @handle or UC… channel id, a subreddit name, a Bluesky handle like name.bsky.social, or an RSS feed's https address), channelId (text channel), roleId (a role to ping, or null) }; a post when the channel goes live or uploads, or the subreddit, account or feed has a new post`,
      },
    },
  },
  economy: {
    label: "Economy",
    fields: {
      enabled: on(
        "members earn the server currency by chatting and the daily claim, and spend it in the shop",
      ),
      currency: {
        label: "Currency",
        kind: "currency",
        about:
          "{ name (plural, like Crowns), singular (Crown), icon (one emoji) }, 24 characters each at most",
      },
      shop: {
        label: "New shop items",
        kind: "shopItems",
        about: `items to add (the saved ones stay): up to ${QM_ADD_MAX} of { name (40 characters), description or null, emoji or empty, price 1-1000000000, kind role|staff, roleId (role: the role it gives, never one with staff powers; staff: null) }; staff items are handed out by staff, so they need staffChannelId`,
      },
      staffChannelId: {
        label: "Staff channel",
        kind: "textChannel",
        about: "where purchases of staff-handled items go",
      },
    },
  },
  rally: {
    label: "LFG templates",
    fields: {
      templates: {
        label: "New LFG templates",
        kind: "lfgTemplates",
        about: `templates to add for /lfg (the saved ones stay): up to ${QM_ADD_MAX} of { name (letters, numbers, spaces, up to 32: "Mythic+", "Raid night"), game or null, roles (like "Tank 2, Healer 2, DPS 6"; up to 4 roles, 2-40 players in all) or null, size (2-40 players when roles is null, else null), group (what a group is called: squad, party, fireteam, raid), lifetimeHours 1-12, voice (true: a members-only voice channel opens when it fills), channelIds (text channels it can be posted in; empty: any) }`,
      },
    },
  },
  invites: {
    label: "Invite tracker",
    fields: {
      labels: {
        label: "New invite labels",
        kind: "inviteLabels",
        about: `labels to add to this server's invites (module_settings invites lists them as server_invites): up to ${QM_ADD_MAX} of { code, name (40 characters), category (Socials, Partners, Ads, Listings, Staff or your own) or null, roleId (given to everyone who joins with it, never one with staff powers) or null }`,
      },
    },
  },
  stats: {
    label: "Server stats",
    fields: {
      enabled: on("voice channels nobody can join show live counts; needs counters"),
      counters: {
        label: "New counters",
        kind: "statCounters",
        about: `counters to add (the saved ones stay): up to ${QM_ADD_MAX} of { kind ${Object.keys(STAT_KINDS).join("|")}, roleId (for role: whose members are counted; else null), template (the channel's name with {count}, and {role} for role; empty: the standard, like "Members: {count}") }; Garrison makes the channels`,
      },
      categoryId: {
        label: "Category",
        kind: "category",
        about: "where the counter channels go; null: a Server stats category at the top",
      },
    },
  },
  // Since 2026-11-23: who handles tickets and where they open, roles back on rejoin, the fun
  // channels and member pages, so the assistant can set up and change every feature's basics.
  tickets: {
    label: "Tickets",
    fields: {
      staffRoleIds: {
        label: "Staff roles",
        kind: "staffRoles",
        about: `roles that see and answer every ticket (${TICKET_LIMITS.staffRoles} at most); moderator and support roles belong here`,
      },
      parentId: {
        label: "Category",
        kind: "category",
        about: "the category ticket channels open under; null: the top of the channel list",
      },
      logChannelId: {
        label: "Log channel",
        kind: "textChannel",
        about: "where a summary goes when a ticket closes (staff-only); null: the dashboard only",
      },
      maxOpen: {
        label: "Open per member",
        kind: "int",
        about: "open tickets one member can have at once",
        min: 1,
        max: TICKET_LIMITS.maxOpen,
      },
      pingStaff: {
        label: "Ping staff",
        kind: "bool",
        about: "ping the staff roles when a ticket opens",
      },
      autoAssign: {
        label: "Auto-assign",
        kind: "bool",
        about: "Pro: hand each new ticket to the staff member with the fewest open",
      },
      modmail: { label: "Modmail", kind: "bool", about: "members open a ticket by DMing Garrison" },
    },
  },
  utilities: {
    label: "Utilities",
    fields: {
      restoreRoles: on("members who leave get their roles back when they rejoin (kept 180 days)"),
      restoreSkipRoleIds: {
        label: "Never give back",
        kind: "roles",
        about: `roles never given back on rejoin (${UTILITY_LIMITS.skipRoles} at most), like one that only means "here right now"`,
      },
    },
  },
  fun: {
    label: "Fun",
    fields: {
      birthdaysEnabled: on("members' birthdays are wished on the day; needs birthdayChannelId"),
      birthdayChannelId: {
        label: "Birthday channel",
        kind: "textChannel",
        about: "where birthday wishes are posted",
      },
      birthdayRoleId: {
        label: "Birthday role",
        kind: "role",
        about: "given for the day, or null; never one with staff powers",
      },
      countingEnabled: on(
        "a counting game: members count up one message at a time; needs countingChannelId",
      ),
      countingChannelId: {
        label: "Counting channel",
        kind: "textChannel",
        about: "the counting game's channel (best a channel of its own)",
      },
    },
  },
  members: {
    label: "Member pages",
    fields: {
      showYou: on("members sign in to see their level, rank card and the leaderboard"),
      showRecord: {
        label: "Their record",
        kind: "bool",
        about: "members see their own warnings, timeouts, kicks and bans (never who acted)",
      },
      publicPage: {
        label: "Public page",
        kind: "bool",
        about: "a page anyone can open: the server's name, icon, member count and About text",
      },
      publicLeaderboard: {
        label: "Public leaderboard",
        kind: "bool",
        about: "the top members by XP on the public page",
      },
      publicAbout: {
        label: "About",
        kind: "text",
        about: `the public page's About text, ${PUBLIC_ABOUT_MAX} characters at most`,
      },
    },
  },
} as const satisfies Partial<Record<SettingsModule, ModuleSpec>>;

export type QmSettingsModule = keyof typeof QM_SETTINGS;
export const QM_SETTINGS_MODULES = Object.keys(QM_SETTINGS) as QmSettingsModule[];
/** The most modules one plan changes, so a plan stays easy to read. */
export const QM_SETTINGS_MAX_MODULES = 12;

const spec = (module: string): ModuleSpec | undefined =>
  (QM_SETTINGS as Record<string, ModuleSpec>)[module];

/** A field's label for the preview: "Automod · Scam links". */
export function qmSettingLabel(module: string, field: string) {
  const m = spec(module);
  return `${m?.label ?? module} · ${m?.fields[field]?.label ?? field}`;
}

/** Whether a field holds channel or role ids (or refs to them), and of what. */
export function qmSettingTarget(module: string, field: string): IdTarget | null {
  const kind = spec(module)?.fields[field]?.kind;
  return kind ? (TARGETS[kind] ?? null) : null;
}

/** The fields, for the model's instructions. Fixed text, so the prompt stays cacheable. */
export function qmSettingsGuide() {
  return QM_SETTINGS_MODULES.map((m) => {
    const s = QM_SETTINGS[m] as ModuleSpec;
    const fields = Object.entries(s.fields).map(([f, x]) => {
      const range = x.min !== undefined ? ` ${x.min}-${x.max}` : "";
      const options = x.options ? ` one of ${x.options.join("/")}` : "";
      return `${f} (${KIND_TEXT[x.kind]}${range}${options}): ${x.about}`;
    });
    return `- ${m} (${s.label} page): ${fields.join("; ")}`;
  }).join("\n");
}

const KIND_TEXT: Record<Kind, string> = {
  bool: "true/false",
  int: "whole number",
  text: "text or null",
  enum: "text",
  words: "list of words",
  emoji: "an emoji",
  textChannel: "a text channel id or ref, or null",
  textChannels: "list of text channel ids or refs",
  staffRoles: "list of role ids or refs (staff roles with moderation powers are fine)",
  voiceChannels: "list of voice channel ids or refs",
  category: "a category id or ref, or null",
  role: "a role id or ref, or null",
  roles: "list of role ids or refs",
  ladder: "list of ladder steps (see the field)",
  rewards: "list of { level, roleId }",
  timezone: "an IANA time zone name",
  currency: "{ name, singular, icon }",
  alertFeeds: "list of new alerts (see the field)",
  shopItems: "list of new shop items (see the field)",
  lfgTemplates: "list of new templates (see the field)",
  inviteLabels: "list of new invite labels (see the field)",
  statCounters: "list of new counters (see the field)",
};

/**
 * Fields that add to a saved list rather than replace it, and what names each item. A change
 * holds only the new items (from: null); applying it adds them to the list as it is then.
 */
const ADDS: Partial<Record<Kind, string>> = {
  alertFeeds: "id",
  shopItems: "id",
  lfgTemplates: "id",
  inviteLabels: "code",
  statCounters: "key",
};
const addKey = (module: string, field: string) => {
  const kind = spec(module)?.fields[field]?.kind;
  return kind ? ADDS[kind] : undefined;
};
/** Whether a field adds items to a saved list (its change holds only the new ones). */
export const qmSettingAdds = (module: string, field: string) => !!addKey(module, field);

type IdTarget = "text" | "voice" | "category" | "role";
const TARGETS: Partial<Record<Kind, IdTarget>> = {
  textChannel: "text",
  textChannels: "text",
  voiceChannels: "voice",
  category: "category",
  role: "role",
  roles: "role",
  staffRoles: "role",
};
const MANY = new Set<Kind>(["textChannels", "voiceChannels", "roles", "staffRoles", "words"]);

/** What the checks need to know about the server: its channels and roles, and the plan's new items. */
export interface QmSettingsLookup {
  channel(id: string): "text" | "voice" | "category" | "other" | null;
  /** `dangerous`: moderation or admin powers. `fixed`: @everyone or a bot's own role. */
  role(id: string): { name: string; status: "ok" | "dangerous" | "fixed" } | null;
  /** What the plan creates under this ref, if anything. */
  created(ref: string): IdTarget | null;
  /** Whether an invite code opens this server. Absent: the invites couldn't be read. */
  invite?(code: string): boolean;
}

export interface QmSettingProposal {
  module: string;
  field: string;
  value: unknown;
}

type Values = Record<string, unknown>;
type Checked = { ok: true; value: Values } | { ok: false; error: string };

/** Each module: its current values with defaults, and the dashboard's check of new ones. */
const MODULES: Record<
  QmSettingsModule,
  {
    read: (row: Values | null) => Values;
    check: (before: Values, patch: Values, ent: Entitlements) => Checked;
  }
> = {
  suggestions: {
    read: (row) => ({ ...readSuggestions(row) }),
    check: (b, p, e) => widen(checkSuggestions({ ...b, ...p }, e, readSuggestions(b))),
  },
  starboard: {
    read: (row) => ({ ...readStarboard(row) }),
    check: (b, p, e) => widen(checkStarboard({ ...b, ...p }, e, readStarboard(b))),
  },
  voice: {
    read: (row) => ({ ...readVoiceRooms(row) }),
    check: (b, p, e) => widen(checkVoiceRooms({ ...b, ...p }, e, readVoiceRooms(b))),
  },
  automod: {
    read: (row) => ({ ...readAutomod(row) }),
    check: (b, p, e) => widen(checkAutomod({ ...b, ...p }, e, readAutomod(b))),
  },
  welcome: {
    read: (row) => ({ ...readWelcome(row) }),
    check: (b, p, e) => {
      // The assistant turns the image off with "off" (its choices are words, not null).
      const patch = p.joinImage === "off" ? { ...p, joinImage: null } : p;
      const r = checkWelcome(patch, e, readWelcome(b));
      return r.ok ? { ok: true, value: { ...b, ...r.value } } : r;
    },
  },
  ranks: {
    read: (row) => ({
      enabled: row?.enabled === true,
      announce: typeof row?.announce === "string" ? row.announce : "same_channel",
      announceChannelId: row?.announceChannelId ?? null,
    }),
    check: (b, p) => {
      const v = { ...b, ...p };
      if (v.announce === "channel" && !v.announceChannelId)
        return { ok: false, error: "Pick the channel for level-up messages." };
      // Only keep a channel when it's used, as the dashboard does.
      return {
        ok: true,
        value: { ...v, announceChannelId: v.announce === "channel" ? v.announceChannelId : null },
      };
    },
  },
  ledger: {
    read: (row) => ({
      channelId: row?.channelId ?? null,
      retentionDays: typeof row?.retentionDays === "number" ? row.retentionDays : 30,
      keepMessageText: row?.keepMessageText === true,
    }),
    check: (b, p) => ({ ok: true, value: { ...b, ...p } }),
  },
  watch: {
    read: (row) => ({
      logChannelId: row?.logChannelId ?? null,
      dmMembers: row?.dmMembers !== false,
      appealsEnabled: row?.appealsEnabled === true,
    }),
    check: (b, p) => ({ ok: true, value: { ...b, ...p } }),
  },
  gatehouse: {
    read: (row) => ({
      antiRaidEnabled: row?.antiRaidEnabled !== false,
      raidJoinCount: typeof row?.raidJoinCount === "number" ? row.raidJoinCount : 10,
      raidWindowSeconds: typeof row?.raidWindowSeconds === "number" ? row.raidWindowSeconds : 30,
      raidResponse: row?.raidResponse === "alert" ? "alert" : "lockdown",
      autoUnlockMinutes: typeof row?.autoUnlockMinutes === "number" ? row.autoUnlockMinutes : 15,
      flagAccountAgeDays: typeof row?.flagAccountAgeDays === "number" ? row.flagAccountAgeDays : 7,
      alertChannelId: row?.alertChannelId ?? null,
      staffRoleIds: Array.isArray(row?.staffRoleIds) ? row.staffRoleIds : [],
      verifyRoleId: row?.verifyRoleId ?? null,
      verifyMinAccountAgeDays:
        typeof row?.verifyMinAccountAgeDays === "number" ? row.verifyMinAccountAgeDays : 0,
      verifyWeb: row?.verifyWeb === true,
      backupWeekly: row?.backupWeekly === true,
    }),
    check: (b, p, e) => {
      const v = { ...b, ...p };
      if ((v.staffRoleIds as unknown[]).length > 10)
        return { ok: false, error: "At most 10 staff roles." };
      // A server back on Free can still turn weekly backups off, as on the Security page.
      if (p.backupWeekly === true && !e["backups.weekly"])
        return { ok: false, error: "Weekly backups are part of Garrison Pro." };
      return { ok: true, value: v };
    },
  },
  ops: {
    read: (row) => ({
      timezone: typeof row?.timezone === "string" ? row.timezone : "UTC",
      trackAttendance: row?.trackAttendance === true,
    }),
    check: (b, p, e) => {
      if (p.trackAttendance === true && !e["ops.attendance"])
        return { ok: false, error: "Attendance is part of Garrison Pro." };
      return { ok: true, value: { ...b, ...p } };
    },
  },
  escalation: {
    read: (row) => ({ rules: Array.isArray(row?.rules) ? row.rules : [] }),
    check: (b, p) => ({ ok: true, value: { ...b, ...p } }),
  },
  rewards: {
    read: (row) => ({ rewards: Array.isArray(row?.rewards) ? row.rewards : [] }),
    check: (b, p) => ({ ok: true, value: { ...b, ...p } }),
  },
  alerts: {
    read: (row) => ({ feeds: readAlertFeeds(row?.feeds ?? []) }),
    check: (b, p, e) => {
      const r = checkAlertFeeds(p.feeds ?? b.feeds, e, b.feeds as AlertFeed[]);
      return r.ok ? { ok: true, value: { feeds: r.value } } : r;
    },
  },
  economy: {
    read: (row) => ({ ...readEconomy(row) }),
    check: (b, p, e) => widen(checkEconomy({ ...b, ...p }, e, readEconomy(b))),
  },
  rally: {
    read: (row) => {
      // The saved list with the widest rules, so a server back on Free can still add within its limit.
      const t = checkTemplates(row?.templates ?? [], "pro");
      return { templates: t.ok ? t.value : [] };
    },
    check: (b, p, e) => {
      const plan = e["rally.templates"] > FEATURES["rally.templates"].free ? "pro" : "free";
      const r = checkTemplates(p.templates ?? b.templates, plan);
      return r.ok ? { ok: true, value: { templates: r.value } } : r;
    },
  },
  invites: {
    read: (row) => ({ labels: readInviteLabels(row?.labels ?? []) }),
    check: (b, p, e) => {
      const r = checkInviteLabels(p.labels ?? b.labels, e, b.labels as InviteLabel[]);
      return r.ok ? { ok: true, value: { labels: r.value } } : r;
    },
  },
  stats: {
    read: (row) => ({ ...readServerStats(row) }),
    check: (b, p, e) => widen(checkServerStats({ ...b, ...p }, e, readServerStats(b))),
  },
  tickets: {
    // Everything but the panels: those are written as new_ticket_panel and stay as they are.
    read: (row) => {
      const config = readTicketConfig(row as Parameters<typeof readTicketConfig>[0]);
      return {
        staffRoleIds: config.staffRoleIds,
        parentId: config.parentId,
        logChannelId: config.logChannelId,
        maxOpen: config.maxOpen,
        pingStaff: config.pingStaff,
        autoAssign: config.autoAssign,
        modmail: config.modmail,
      };
    },
    check: (b, p, e) =>
      widen(checkTicketOptions({ ...b, ...p }, e, { autoAssign: b.autoAssign === true })),
  },
  utilities: {
    read: (row) => ({
      restoreRoles: row?.restoreRoles === true,
      restoreSkipRoleIds: Array.isArray(row?.restoreSkipRoleIds) ? row.restoreSkipRoleIds : [],
    }),
    check: (b, p) => {
      const v = { ...b, ...p };
      const skip = Array.isArray(v.restoreSkipRoleIds) ? v.restoreSkipRoleIds : [];
      if (skip.length > UTILITY_LIMITS.skipRoles)
        return { ok: false, error: `Skip up to ${UTILITY_LIMITS.skipRoles} roles.` };
      return {
        ok: true,
        value: { restoreRoles: v.restoreRoles === true, restoreSkipRoleIds: skip },
      };
    },
  },
  fun: {
    read: (row) => ({
      birthdaysEnabled: row?.birthdaysEnabled === true,
      birthdayChannelId: row?.birthdayChannelId ?? null,
      birthdayRoleId: row?.birthdayRoleId ?? null,
      countingEnabled: row?.countingEnabled === true,
      countingChannelId: row?.countingChannelId ?? null,
    }),
    check: (b, p) => {
      const v = { ...b, ...p };
      if (v.birthdaysEnabled === true && !v.birthdayChannelId)
        return { ok: false, error: "Birthdays need a channel (birthdayChannelId)." };
      if (v.countingEnabled === true && !v.countingChannelId)
        return { ok: false, error: "Counting needs a channel (countingChannelId)." };
      return {
        ok: true,
        value: {
          birthdaysEnabled: v.birthdaysEnabled === true,
          birthdayChannelId: v.birthdayChannelId ?? null,
          birthdayRoleId: v.birthdayRoleId ?? null,
          countingEnabled: v.countingEnabled === true,
          countingChannelId: v.countingChannelId ?? null,
        },
      };
    },
  },
  members: {
    read: (row) => ({
      showYou: row?.showYou !== false,
      showRecord: row?.showRecord === true,
      publicPage: row?.publicPage === true,
      publicLeaderboard: row?.publicLeaderboard === true,
      publicAbout: row?.publicAbout ?? null,
    }),
    check: (b, p) => {
      const v = { ...b, ...p };
      const about = typeof v.publicAbout === "string" ? v.publicAbout.trim() : null;
      if (about && about.length > PUBLIC_ABOUT_MAX)
        return { ok: false, error: `The About text is ${PUBLIC_ABOUT_MAX} characters at most.` };
      return {
        ok: true,
        value: {
          showYou: v.showYou !== false,
          showRecord: v.showRecord === true,
          publicPage: v.publicPage === true,
          publicLeaderboard: v.publicLeaderboard === true,
          publicAbout: about || null,
        },
      };
    },
  },
};

function widen<T extends object>(
  r: { ok: true; value: T } | { ok: false; error: string },
): Checked {
  return r.ok ? { ok: true, value: { ...r.value } as Values } : r;
}

/** JSON with sorted keys, to compare values. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Values)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
export const sameSetting = (a: unknown, b: unknown) => stable(a) === stable(b);

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Check what a plan proposes for settings, against the server's current values and the
 * dashboard's own rules (plan limits, required channels, ranges). Channels and roles must be
 * in this server or made by the same plan, of the right kind, and never a role with
 * moderation or admin powers. Returns one change per field that would really change.
 */
export async function checkQmSettings(
  db: Db,
  guildId: string,
  proposals: QmSettingProposal[],
  lookup: QmSettingsLookup,
  ent: Entitlements,
): Promise<
  | {
      ok: true;
      changes: QmSettingChange[];
      /** Each changed module's values in full, as checked: what applying an added list saves. */
      full: Partial<Record<string, Values>>;
    }
  | { ok: false; errors: string[] }
> {
  const errors: string[] = [];
  const byModule = new Map<QmSettingsModule, Values>();
  // Refs stand in as fake ids while the dashboard's checks run, which only accept ids.
  const stand = new Map<string, string>();
  const back = new Map<string, string>();
  const standIn = (ref: string) => {
    let id = stand.get(ref);
    if (!id) {
      id = String(900000000000000000n + BigInt(stand.size + 1));
      stand.set(ref, id);
      back.set(id, ref);
    }
    return id;
  };

  for (const p of proposals) {
    const m = spec(p.module);
    const name = qmSettingLabel(p.module, p.field);
    if (!m) {
      errors.push(`${p.module} settings can't be changed by the AI assistant.`);
      continue;
    }
    const f = m.fields[p.field];
    if (!f) {
      errors.push(`${m.label}: "${p.field}" can't be changed by the AI assistant.`);
      continue;
    }
    const module = p.module as QmSettingsModule;
    const patch = byModule.get(module) ?? {};
    if (!byModule.has(module)) {
      if (byModule.size >= QM_SETTINGS_MAX_MODULES) {
        errors.push(`A plan changes at most ${QM_SETTINGS_MAX_MODULES} modules' settings.`);
        continue;
      }
      byModule.set(module, patch);
    }
    if (p.field in patch) {
      errors.push(`${name} is set twice.`);
      continue;
    }
    const shaped = shape(f, p.value, name, lookup, standIn);
    if (typeof shaped === "string") errors.push(shaped);
    else patch[p.field] = shaped.value;
  }
  if (errors.length) return { ok: false, errors };

  const changes: QmSettingChange[] = [];
  const full: Partial<Record<string, Values>> = {};
  const restore = (v: unknown): unknown =>
    typeof v === "string"
      ? (back.get(v) ?? v)
      : Array.isArray(v)
        ? v.map(restore)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, restore(x)]))
          : v;
  for (const [module, patch] of byModule) {
    const run = MODULES[module];
    const before = run.read(await readSettings(db, guildId, module));
    // An added list goes after the saved one, and is checked whole.
    const merged: Values = { ...patch };
    for (const field of Object.keys(patch))
      if (addKey(module, field))
        merged[field] = [
          ...(Array.isArray(before[field]) ? (before[field] as unknown[]) : []),
          ...(patch[field] as unknown[]),
        ];
    const checked = run.check(before, merged, ent);
    if (!checked.ok) {
      errors.push(`${QM_SETTINGS[module].label}: ${checked.error}`);
      continue;
    }
    full[module] = restore(checked.value) as Values;
    for (const field of Object.keys(QM_SETTINGS[module].fields)) {
      if (!(field in checked.value)) continue;
      const key = addKey(module, field);
      if (key) {
        if (!(field in patch)) continue;
        const had = new Set(
          (Array.isArray(before[field]) ? (before[field] as Values[]) : []).map((x) => x[key]),
        );
        const added = (checked.value[field] as Values[]).filter((x) => !had.has(x[key]));
        if (added.length) changes.push({ module, field, from: null, to: restore(added) });
        continue;
      }
      const to = restore(checked.value[field]);
      if (sameSetting(before[field], to)) continue;
      changes.push({ module, field, from: before[field] ?? null, to: to ?? null });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, changes, full };
}

/** A proposed list of new items, or why it isn't one. */
function items(value: unknown, name: string): Values[] | string {
  if (!Array.isArray(value) || !value.length) return `${name}: a list of at least one.`;
  if (value.length > QM_ADD_MAX) return `${name}: up to ${QM_ADD_MAX} at once.`;
  return value.map((v) => (v && typeof v === "object" ? (v as Values) : {}));
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const ITEM_ID = /^[a-z0-9]{6,16}$/;
/** An item's id: kept when it already has one (a stored draft), else a new one. */
const itemId = (v: unknown) => (typeof v === "string" && ITEM_ID.test(v) ? v : newId());

/** New items for an added list, with their channel and role refs checked. */
function shapeItems(
  f: FieldSpec,
  value: unknown,
  name: string,
  lookup: QmSettingsLookup,
  standIn: (ref: string) => string,
): { value: unknown } | string {
  const list = items(value, name);
  if (typeof list === "string") return list;
  const one = (kind: Kind, v: unknown) =>
    shape({ label: name, kind, about: "" }, v ?? null, name, lookup, standIn);
  const out: Values[] = [];
  for (const r of list) {
    if (f.kind === "alertFeeds") {
      const provider = ALERT_PROVIDER_LIST.find((p) => p === r.provider) ?? null;
      if (!provider)
        return `${name}: each alert is for twitch, kick, youtube, reddit, bluesky or rss.`;
      const handle = normalizeHandle(provider, str(r.handle));
      if (!handle)
        return `${name}: "${str(r.handle).slice(0, 40)}" isn't a ${ALERT_PROVIDERS[provider].example}.`;
      const channel = one("textChannel", r.channelId);
      if (typeof channel === "string") return channel;
      if (!channel.value) return `${name}: each alert needs the channel it posts in.`;
      const role = one("role", r.roleId || null);
      if (typeof role === "string") return role;
      out.push({
        id: itemId(r.id),
        provider,
        handle,
        channelId: channel.value,
        roleId: role.value,
        message: null,
        accent: null,
      });
    } else if (f.kind === "shopItems") {
      const kind = r.kind === "role" ? "role" : "staff";
      const role = kind === "role" ? one("role", r.roleId || null) : { value: null };
      if (typeof role === "string") return role;
      if (kind === "role" && !role.value) return `${name}: a role item needs the role it gives.`;
      out.push({
        id: itemId(r.id),
        name: str(r.name),
        description: str(r.description) || null,
        emoji: str(r.emoji) || null,
        price: r.price,
        kind,
        roleId: role.value,
        hours: null,
        stock: null,
        perMember: null,
        needsRoleId: null,
      });
    } else if (f.kind === "lfgTemplates") {
      const channels = one("textChannels", Array.isArray(r.channelIds) ? r.channelIds : []);
      if (typeof channels === "string") return channels;
      out.push({
        id: itemId(r.id),
        name: str(r.name),
        game: str(r.game) || null,
        roles: str(r.roles) || null,
        size: str(r.roles) ? null : (r.size ?? null),
        wording: { ...DEFAULT_WORDING, group: str(r.group) || DEFAULT_WORDING.group },
        lifetimeHours: r.lifetimeHours ?? 3,
        voice: r.voice !== false,
        channelIds: channels.value,
        notifyRoleId: null,
        isDefault: false,
      });
    } else if (f.kind === "inviteLabels") {
      const code = inviteCode(str(r.code));
      if (!code) return `${name}: "${str(r.code).slice(0, 40)}" isn't an invite code.`;
      if (!lookup.invite) return `${name}: Garrison couldn't read this server's invites just now.`;
      if (!lookup.invite(code)) return `${name}: ${code} isn't one of this server's invites.`;
      const role = one("role", r.roleId || null);
      if (typeof role === "string") return role;
      out.push({
        code,
        name: str(r.name),
        color: null,
        description: null,
        category: str(r.category) || null,
        roleId: role.value,
        partner: null,
      });
    } else if (f.kind === "statCounters") {
      const kind = str(r.kind);
      if (!(kind in STAT_KINDS))
        return `${name}: each counter counts one of ${Object.keys(STAT_KINDS).join(", ")}.`;
      let roleId: string | null = null;
      if (kind === "role") {
        // Counting a role's members gives nobody anything, so staff roles are fine here.
        const id = str(r.roleId);
        const made = lookup.created(id.toLowerCase());
        if (made === "role") roleId = standIn(id.toLowerCase());
        else if (SNOWFLAKE.test(id) && lookup.role(id) && lookup.role(id)?.status !== "fixed")
          roleId = id;
        else return `${name}: a role counter needs a role in this server.`;
      }
      out.push({
        key: itemId(r.key),
        kind,
        roleId,
        template: str(r.template),
        channelId: null,
      });
    }
  }
  return { value: out };
}

/** One proposed value in the field's shape, with channel and role refs checked. */
function shape(
  f: FieldSpec,
  value: unknown,
  name: string,
  lookup: QmSettingsLookup,
  standIn: (ref: string) => string,
): { value: unknown } | string {
  const target = TARGETS[f.kind];
  if (target) {
    if (value === null && !MANY.has(f.kind)) return { value: null };
    const list = MANY.has(f.kind) ? value : [value];
    if (!Array.isArray(list) || !list.every((v) => typeof v === "string"))
      return `${name}: ${KIND_TEXT[f.kind]}.`;
    if (list.length > 25) return `${name}: at most 25.`;
    const out: string[] = [];
    for (const raw of list as string[]) {
      const id = raw.trim();
      const made = lookup.created(id.toLowerCase());
      if (made) {
        if (made !== target) return `${name}: ${id} isn't a ${TARGET_TEXT[target]}.`;
        out.push(standIn(id.toLowerCase()));
        continue;
      }
      if (!SNOWFLAKE.test(id)) return `${name}: "${id.slice(0, 40)}" isn't in this server.`;
      if (target === "role") {
        const role = lookup.role(id);
        if (!role) return `${name}: that role isn't in this server.`;
        // A staff-role field names who handles something; it never gives the role to anyone.
        if (role.status === "dangerous" && f.kind !== "staffRoles")
          return `${name}: @${role.name} has moderation or admin powers, so the AI assistant won't use it.`;
        if (role.status === "fixed") return `${name}: @${role.name} can't be used here.`;
      } else if (lookup.channel(id) !== target)
        return `${name}: that isn't a ${TARGET_TEXT[target]} in this server.`;
      out.push(id);
    }
    const unique = [...new Set(out)];
    return { value: MANY.has(f.kind) ? unique : (unique[0] ?? null) };
  }
  if (ADDS[f.kind]) return shapeItems(f, value, name, lookup, standIn);
  if (f.kind === "currency") {
    const c = (value && typeof value === "object" ? value : {}) as Values;
    return { value: { name: str(c.name), singular: str(c.singular), icon: str(c.icon) } };
  }
  if (f.kind === "timezone") {
    if (typeof value !== "string") return `${name}: a time zone like America/Chicago.`;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
      return { value: value.trim() };
    } catch {
      return `${name}: "${value.slice(0, 40)}" isn't a time zone. Use a name like America/Chicago.`;
    }
  }
  if (f.kind === "ladder") {
    if (!Array.isArray(value) || value.length > QM_LADDER.steps)
      return `${name}: up to ${QM_LADDER.steps} steps.`;
    const steps: {
      warnCount: number;
      windowMinutes: number;
      action: string;
      durationSeconds: number | null;
    }[] = [];
    for (const raw of value) {
      const st = (raw ?? {}) as Record<string, unknown>;
      const warnCount = st.warnCount;
      const windowMinutes = st.windowMinutes;
      const action = st.action;
      if (!Number.isInteger(warnCount) || (warnCount as number) < 1 || (warnCount as number) > 50)
        return `${name}: each step needs 1 to 50 warnings.`;
      if (!(QM_LADDER.windows as readonly unknown[]).includes(windowMinutes))
        return `${name}: the window is one of ${QM_LADDER.windows.join(", ")} minutes.`;
      if (action !== "timeout" && action !== "kick" && action !== "ban")
        return `${name}: each step times out, kicks or bans.`;
      const durationSeconds = action === "timeout" ? st.durationSeconds : null;
      if (
        action === "timeout" &&
        !(QM_LADDER.durations as readonly unknown[]).includes(durationSeconds)
      )
        return `${name}: a timeout lasts one of ${QM_LADDER.durations.join(", ")} seconds.`;
      steps.push({
        warnCount: warnCount as number,
        windowMinutes: windowMinutes as number,
        action,
        durationSeconds: durationSeconds as number | null,
      });
    }
    if (new Set(steps.map((x) => x.warnCount)).size !== steps.length)
      return `${name}: each step needs a different number of warnings.`;
    return { value: steps };
  }
  if (f.kind === "rewards") {
    if (!Array.isArray(value) || value.length > REWARDS_MAX)
      return `${name}: up to ${REWARDS_MAX} rewards.`;
    const out: { level: number; roleId: string }[] = [];
    for (const raw of value) {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (!Number.isInteger(r.level) || (r.level as number) < 1 || (r.level as number) > 500)
        return `${name}: each reward needs a level from 1 to 500.`;
      const role = shape({ label: name, kind: "role", about: "" }, r.roleId, name, lookup, standIn);
      if (typeof role === "string") return role;
      if (!role.value) return `${name}: each reward needs a role.`;
      if (out.some((x) => x.level === r.level)) return `${name}: two rewards at level ${r.level}.`;
      out.push({ level: r.level as number, roleId: role.value as string });
    }
    return { value: out };
  }
  switch (f.kind) {
    case "bool":
      return typeof value === "boolean" ? { value } : `${name}: true or false.`;
    case "int":
      return Number.isInteger(value) &&
        (value as number) >= (f.min ?? 0) &&
        (value as number) <= (f.max ?? Number.MAX_SAFE_INTEGER)
        ? { value }
        : `${name} goes from ${f.min} to ${f.max}.`;
    case "enum":
      return typeof value === "string" && f.options?.includes(value)
        ? { value }
        : `${name}: one of ${f.options?.join(", ")}.`;
    case "text":
      return value === null || typeof value === "string"
        ? { value: typeof value === "string" ? value.trim().slice(0, 100) || null : null }
        : `${name}: text.`;
    case "emoji":
      return typeof value === "string" ? { value: value.trim() } : `${name}: one emoji.`;
    case "words":
      return Array.isArray(value) && value.every((w) => typeof w === "string")
        ? { value }
        : `${name}: a list of words.`;
    default:
      return `${name} can't be set.`;
  }
}

const TARGET_TEXT: Record<IdTarget, string> = {
  text: "text channel",
  voice: "voice channel",
  category: "category",
  role: "role",
};

/**
 * A setting's value in words, for the preview: On/Off, channel and role names, counts.
 * `name` turns an id or a plan's ref into "#general" or "@Members".
 */
export function qmSettingValueText(
  module: string,
  field: string,
  value: unknown,
  name: (idOrRef: string) => string,
): string {
  const kind = spec(module)?.fields[field]?.kind;
  if (kind && ADDS[kind]) {
    // An added list has no "before": the saved items stay as they are.
    if (!Array.isArray(value)) return "";
    const v = value as Values[];
    const text = v.map((x) => {
      if (kind === "alertFeeds")
        return `${ALERT_PROVIDERS[x.provider as AlertFeed["provider"]]?.label ?? "Alert"} ${x.handle} in ${name(String(x.channelId))}${x.roleId ? `, pings ${name(String(x.roleId))}` : ""}`;
      if (kind === "shopItems")
        return `${x.name} for ${Number(x.price).toLocaleString("en-US")}${x.roleId ? `, gives ${name(String(x.roleId))}` : ", staff-handled"}`;
      if (kind === "lfgTemplates")
        return `${x.name}${x.game ? ` (${x.game})` : ""}: ${x.roles ?? `${x.size ?? 5} players`}`;
      if (kind === "inviteLabels")
        return `${x.code} as “${x.name}”${x.roleId ? `, gives ${name(String(x.roleId))}` : ""}`;
      const template =
        String(x.template ?? "") ||
        STAT_KINDS[x.kind as keyof typeof STAT_KINDS]?.template ||
        "{count}";
      return `${template.replace("{role}", x.roleId ? name(String(x.roleId)).replace(/^@/, "") : "Role")}`;
    });
    return `adds ${text.join("; ")}`;
  }
  if (kind === "currency" && value && typeof value === "object") {
    const c = value as Values;
    return `${c.icon} ${c.name}`;
  }
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (kind === "words" && Array.isArray(value))
    return value.length ? `${value.length} word${value.length === 1 ? "" : "s"}` : "none";
  if (kind && TARGETS[kind]) {
    const list = Array.isArray(value) ? value : [value];
    return list.length ? list.map((v) => name(String(v))).join(", ") : "none";
  }
  if (kind === "enum") return String(value).replace(/_/g, " ");
  if (kind === "ladder" && Array.isArray(value))
    return value.length
      ? value
          .map(
            (st: {
              warnCount: number;
              windowMinutes: number;
              action: string;
              durationSeconds: number | null;
            }) => {
              const within =
                st.windowMinutes >= 1440
                  ? `${st.windowMinutes / 1440} d`
                  : `${st.windowMinutes / 60} h`;
              const lasts = st.durationSeconds
                ? ` ${st.durationSeconds >= 86400 ? `${st.durationSeconds / 86400} d` : st.durationSeconds >= 3600 ? `${st.durationSeconds / 3600} h` : `${st.durationSeconds / 60} min`}`
                : "";
              return `${st.warnCount} warnings in ${within} → ${st.action}${lasts}`;
            },
          )
          .join("; ")
      : "none";
  if (kind === "rewards" && Array.isArray(value))
    return value.length
      ? value
          .map((r: { level: number; roleId: string }) => `level ${r.level}: ${name(r.roleId)}`)
          .join(", ")
      : "none";
  return String(value);
}

/** A change's value with refs swapped for the ids the build made. Only id fields are touched. */
export function resolveQmSettingRefs(change: QmSettingChange, ids: Map<string, string>): unknown {
  const kind = spec(change.module)?.fields[change.field]?.kind;
  if (kind && ADDS[kind]) {
    // Only the id fields: an item's name could match a ref.
    const ID_KEYS = new Set(["channelId", "roleId", "channelIds"]);
    const at = (v: unknown): unknown =>
      typeof v === "string" ? (ids.get(v) ?? v) : Array.isArray(v) ? v.map(at) : v;
    return Array.isArray(change.to)
      ? (change.to as Values[]).map((x) =>
          Object.fromEntries(Object.entries(x).map(([k, v]) => [k, ID_KEYS.has(k) ? at(v) : v])),
        )
      : change.to;
  }
  if (!qmSettingTarget(change.module, change.field) && kind !== "rewards") return change.to;
  const swap = (v: unknown): unknown =>
    typeof v === "string"
      ? (ids.get(v) ?? v)
      : Array.isArray(v)
        ? v.map(swap)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]))
          : v;
  return swap(change.to);
}

/** The most posts one plan makes. */
export const QM_POSTS_MAX = 10;
export const QM_POST_KINDS = ["role_menu", "ticket_panel", "message"] as const;
const POST_TEXT: Record<QmPost["kind"], string> = {
  role_menu: "Role menu",
  ticket_panel: "Ticket panel",
  message: "Saved message",
};
export const qmPostLabel = (kind: QmPost["kind"]) => POST_TEXT[kind];

/** The role menus, ticket panels and saved messages this server has, by id and name. */
export async function qmPostables(db: Db, guildId: string) {
  const [menus, tickets, messages] = await Promise.all([
    readSettings(db, guildId, "roles"),
    readSettings(db, guildId, "tickets"),
    readSettings(db, guildId, "messages"),
  ]);
  const pick = (list: { id: string; name: string }[]) => list.map(({ id, name }) => ({ id, name }));
  return {
    role_menu: pick(readRoleMenus(menus?.menus ?? [])),
    ticket_panel: pick(readTicketPanels(tickets?.panels ?? [])),
    message: pick(readMessages(messages?.messages ?? [])),
  } satisfies Record<QmPost["kind"], { id: string; name: string }[]>;
}

export interface QmPostProposal {
  kind: string;
  itemId: string;
  channel: string;
}

/**
 * Check what a plan proposes to post: saved items this server has, into a text channel in
 * this server or one the plan creates. Posting itself is checked again when the plan is
 * built, by the dashboard's own post handlers, with the admin's permissions.
 */
export async function checkQmPosts(
  db: Db,
  guildId: string,
  proposals: QmPostProposal[],
  lookup: QmSettingsLookup,
  /**
   * What the same plan makes (messages, role menus, ticket panels), by the ref the model gave
   * them, which it may post too.
   */
  written: { kind?: QmPost["kind"]; ref: string; id: string; name: string }[] = [],
): Promise<{ ok: true; posts: QmPost[] } | { ok: false; errors: string[] }> {
  if (!proposals.length) return { ok: true, posts: [] };
  const errors: string[] = [];
  if (proposals.length > QM_POSTS_MAX) errors.push(`A plan posts at most ${QM_POSTS_MAX} things.`);
  const saved = await qmPostables(db, guildId);
  const made = (kind: QmPost["kind"]) =>
    written.filter((w) => (w.kind ?? "message") === kind).map(({ id, name }) => ({ id, name }));
  const have = {
    role_menu: [...saved.role_menu, ...made("role_menu")],
    ticket_panel: [...saved.ticket_panel, ...made("ticket_panel")],
    message: [...saved.message, ...made("message")],
  };
  // Something the plan makes is named by its ref; it posts by its id.
  proposals = proposals.map((p) => {
    const w = written.find(
      (x) => (x.kind ?? "message") === p.kind && x.ref === String(p.itemId).toLowerCase(),
    );
    return w ? { ...p, itemId: w.id } : p;
  });
  const posts: QmPost[] = [];
  const seen = new Set<string>();
  for (const p of proposals.slice(0, QM_POSTS_MAX)) {
    if (!(QM_POST_KINDS as readonly string[]).includes(p.kind)) {
      errors.push(`"${String(p.kind).slice(0, 30)}" isn't something the AI assistant can post.`);
      continue;
    }
    const kind = p.kind as QmPost["kind"];
    const item = have[kind].find((x) => x.id === p.itemId);
    if (!item) {
      errors.push(
        `${POST_TEXT[kind]} "${String(p.itemId).slice(0, 30)}" isn't saved on this server.`,
      );
      continue;
    }
    const raw = String(p.channel ?? "").trim();
    const made = lookup.created(raw.toLowerCase());
    const channel = made ? raw.toLowerCase() : raw;
    if (made ? made !== "text" : lookup.channel(raw) !== "text") {
      errors.push(`${POST_TEXT[kind]} ${item.name}: post it in a text channel in this server.`);
      continue;
    }
    const key = `${kind}:${item.id}`;
    if (seen.has(key)) {
      errors.push(`${POST_TEXT[kind]} ${item.name} is posted twice.`);
      continue;
    }
    seen.add(key);
    posts.push({ kind, itemId: item.id, name: item.name, channel });
  }
  return errors.length ? { ok: false, errors } : { ok: true, posts };
}
