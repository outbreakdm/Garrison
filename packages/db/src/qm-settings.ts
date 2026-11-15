import { AUTOMOD_LIMITS, checkAutomod, readAutomod } from "./automod";
import type { Db } from "./client";
import { readMessages } from "./messages";
import type { Entitlements } from "./plans";
import { readSettings } from "./repo/settings";
import { readRoleMenus } from "./role-menus";
import type { QmPost, QmSettingChange, SettingsModule } from "./schema";
import { checkStarboard, readStarboard, STARBOARD_LIMITS } from "./starboard";
import { checkSuggestions, readSuggestions } from "./suggestions";
import { readTicketPanels } from "./tickets";
import { checkVoiceRooms, readVoiceRooms, VOICE_LIMITS } from "./voice-rooms";
import { checkWelcome, readWelcome } from "./welcome";

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
  | "roles";

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
    },
  },
  ranks: {
    label: "Leveling",
    fields: {
      enabled: on("members earn XP for chatting and level up"),
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
      logChannelId: {
        label: "Mod log",
        kind: "textChannel",
        about: "where warnings, timeouts, kicks and bans are logged",
      },
      dmMembers: { label: "DM members", kind: "bool", about: "tell members when they're punished" },
    },
  },
} as const satisfies Partial<Record<SettingsModule, ModuleSpec>>;

export type QmSettingsModule = keyof typeof QM_SETTINGS;
export const QM_SETTINGS_MODULES = Object.keys(QM_SETTINGS) as QmSettingsModule[];
/** The most modules one plan changes, so a plan stays easy to read. */
export const QM_SETTINGS_MAX_MODULES = 6;

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
  voiceChannels: "list of voice channel ids or refs",
  category: "a category id or ref, or null",
  roles: "list of role ids or refs",
};

type IdTarget = "text" | "voice" | "category" | "role";
const TARGETS: Partial<Record<Kind, IdTarget>> = {
  textChannel: "text",
  textChannels: "text",
  voiceChannels: "voice",
  category: "category",
  roles: "role",
};
const MANY = new Set<Kind>(["textChannels", "voiceChannels", "roles", "words"]);

/** What the checks need to know about the server: its channels and roles, and the plan's new items. */
export interface QmSettingsLookup {
  channel(id: string): "text" | "voice" | "category" | "other" | null;
  /** `dangerous`: moderation or admin powers. `fixed`: @everyone or a bot's own role. */
  role(id: string): { name: string; status: "ok" | "dangerous" | "fixed" } | null;
  /** What the plan creates under this ref, if anything. */
  created(ref: string): IdTarget | null;
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
      const r = checkWelcome(p, e, readWelcome(b));
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
    }),
    check: (b, p) => ({ ok: true, value: { ...b, ...p } }),
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
): Promise<{ ok: true; changes: QmSettingChange[] } | { ok: false; errors: string[] }> {
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
  const restore = (v: unknown): unknown =>
    typeof v === "string" ? (back.get(v) ?? v) : Array.isArray(v) ? v.map(restore) : v;
  for (const [module, patch] of byModule) {
    const run = MODULES[module];
    const before = run.read(await readSettings(db, guildId, module));
    const checked = run.check(before, patch, ent);
    if (!checked.ok) {
      errors.push(`${QM_SETTINGS[module].label}: ${checked.error}`);
      continue;
    }
    for (const field of Object.keys(QM_SETTINGS[module].fields)) {
      if (!(field in checked.value)) continue;
      const to = restore(checked.value[field]);
      if (sameSetting(before[field], to)) continue;
      changes.push({ module, field, from: before[field] ?? null, to: to ?? null });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, changes };
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
        if (role.status === "dangerous")
          return `${name}: @${role.name} has moderation or admin powers, so the AI assistant won't use it.`;
        if (role.status === "fixed") return `${name}: @${role.name} can't be used here.`;
      } else if (lookup.channel(id) !== target)
        return `${name}: that isn't a ${TARGET_TEXT[target]} in this server.`;
      out.push(id);
    }
    const unique = [...new Set(out)];
    return { value: MANY.has(f.kind) ? unique : (unique[0] ?? null) };
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
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (kind === "words" && Array.isArray(value))
    return value.length ? `${value.length} word${value.length === 1 ? "" : "s"}` : "none";
  if (kind && TARGETS[kind]) {
    const list = Array.isArray(value) ? value : [value];
    return list.length ? list.map((v) => name(String(v))).join(", ") : "none";
  }
  if (kind === "enum") return String(value).replace(/_/g, " ");
  return String(value);
}

/** A change's value with refs swapped for the ids the build made. Only id fields are touched. */
export function resolveQmSettingRefs(change: QmSettingChange, ids: Map<string, string>): unknown {
  if (!qmSettingTarget(change.module, change.field)) return change.to;
  const swap = (v: unknown): unknown =>
    typeof v === "string" ? (ids.get(v) ?? v) : Array.isArray(v) ? v.map(swap) : v;
  return swap(change.to);
}

/** The most posts one plan makes. */
export const QM_POSTS_MAX = 5;
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
): Promise<{ ok: true; posts: QmPost[] } | { ok: false; errors: string[] }> {
  if (!proposals.length) return { ok: true, posts: [] };
  const errors: string[] = [];
  if (proposals.length > QM_POSTS_MAX) errors.push(`A plan posts at most ${QM_POSTS_MAX} things.`);
  const have = await qmPostables(db, guildId);
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
