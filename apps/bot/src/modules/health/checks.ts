import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { DANGEROUS_PERMISSIONS, permissionNames } from "../gatehouse/nuke.js";

const P = PermissionFlagsBits;

/** Everything Garrison needs, by module, and why. Never Administrator. */
/** `optional`: only one feature needs it, so missing it is a warning, not a fix. */
export const REQUIRED_PERMISSIONS: {
  module: string;
  bits: bigint;
  why: string;
  optional?: boolean;
}[] = [
  {
    module: "Core",
    bits: P.ViewChannel | P.SendMessages | P.EmbedLinks,
    why: "to reply and post logs",
  },
  {
    module: "Moderation",
    bits:
      P.ModerateMembers | P.KickMembers | P.BanMembers | P.ManageMessages | P.ReadMessageHistory,
    why: "for timeouts, kicks, bans and /purge",
  },
  {
    module: "Security",
    bits: P.ManageChannels | P.ManageRoles | P.ManageGuild | P.ViewAuditLog,
    why: "for lockdowns, verification, pausing invites and anti-nuke",
  },
  { module: "Groups", bits: P.Connect, why: "to open voice channels for full squads" },
  {
    module: "Voice rooms",
    bits: P.MoveMembers,
    why: "to move a member into the voice room they just made",
    optional: true,
  },
  {
    module: "AI assistant",
    bits:
      P.AddReactions |
      P.Stream |
      P.AttachFiles |
      P.UseExternalEmojis |
      P.Speak |
      P.UseVAD |
      P.CreatePublicThreads |
      P.UseExternalStickers |
      P.SendMessagesInThreads,
    why: "to give new roles and channels member permissions like files, threads and speaking",
    optional: true,
  },
  {
    module: "Profile",
    bits: P.ChangeNickname,
    why: "to use the nickname set for it on the dashboard",
    optional: true,
  },
];

export const ALL_REQUIRED = REQUIRED_PERMISSIONS.reduce((acc, r) => acc | r.bits, 0n);

export type CheckStatus = "ok" | "fix" | "warn";

/**
 * Where a check is fixed, and the words for the button: a section of a dashboard page under the
 * server ("/watch#settings"; a #section opens the tab it's on), or "permissions" for Discord's
 * page that gives Garrison exactly the permissions it uses. None when the fix is in Discord's
 * own settings (a role's place in the list): the text says how.
 */
export interface CheckFix {
  to: `/${string}` | "permissions";
  action: string;
}

export interface Check {
  status: CheckStatus;
  /** What the check is about, the same on every run: "perm:Moderation", "log-channel". */
  key: string;
  /** The problem (or that all's well) in a few words: "No moderation log channel". */
  title: string;
  /** The sentence: what's wrong and what it means, or that it works. */
  text: string;
  fix?: CheckFix;
}

/** Fixes on the dashboard, by what they change. */
const FIX = {
  permissions: { to: "permissions", action: "Give the permissions" },
  logChannel: { to: "/watch#settings", action: "Pick a log channel" },
  alertChannel: { to: "/gatehouse#anti-raid", action: "Pick an alert channel" },
  verifyRole: { to: "/gatehouse#verification", action: "Pick a role" },
  staffRoles: { to: "/gatehouse#anti-raid", action: "Review staff roles" },
  antiRaid: { to: "/gatehouse#anti-raid", action: "Turn on anti-raid" },
  antiNuke: { to: "/gatehouse#anti-nuke", action: "Open anti-nuke" },
} as const satisfies Record<string, CheckFix>;

export interface ChannelAccess {
  exists: boolean;
  canPost: boolean;
}

export interface HealthInput {
  everyoneId: string;
  botPermissions: bigint;
  botTop: number;
  roles: { id: string; position: number; managed: boolean; permissions: bigint }[];
  logChannelId: string | null;
  logChannel: ChannelAccess | null;
  alertChannelId: string | null;
  alertChannel: ChannelAccess | null;
  verifyRoleId: string | null;
  staffRoleIds: string[];
  antiRaidEnabled: boolean;
  antiNukeEnabled: boolean;
}

/** Turn a snapshot of a server into health checks, worst first. Pure, so it's easy to test. */
export function runHealthChecks(h: HealthInput): Check[] {
  const checks: Check[] = [];
  const has = (bits: bigint) => (h.botPermissions & bits) === bits;
  const isAdmin = (h.botPermissions & P.Administrator) !== 0n;

  for (const req of REQUIRED_PERMISSIONS) {
    const missing = req.bits & ~h.botPermissions;
    if (missing && !isAdmin) {
      checks.push({
        status: req.optional ? "warn" : "fix",
        key: `perm:${req.module}`,
        title: `${req.module} is missing permissions`,
        text: `Garrison needs ${permissionNames(missing)} ${req.why}.`,
        fix: FIX.permissions,
      });
    }
  }
  if (isAdmin) {
    checks.push({
      status: "warn",
      key: "administrator",
      title: "Garrison has Administrator",
      text: "It doesn't need it. Give it exactly the permissions it uses, then take Administrator away in Server Settings → Roles.",
      fix: FIX.permissions,
    });
  } else if (has(ALL_REQUIRED)) {
    checks.push({
      status: "ok",
      key: "permissions",
      title: "Permissions",
      text: "Garrison has every permission it uses, and nothing more.",
    });
  }

  const dangerousAbove = h.roles.filter(
    (r) =>
      r.id !== h.everyoneId &&
      !r.managed &&
      r.position >= h.botTop &&
      (r.permissions & DANGEROUS_PERMISSIONS) !== 0n,
  );
  if (dangerousAbove.length) {
    const list = dangerousAbove.map((r) => `<@&${r.id}>`).join(" ");
    const one = dangerousAbove.length === 1;
    checks.push({
      status: "fix",
      key: "role-order",
      title: one
        ? "A role with moderation powers sits above Garrison"
        : `${dangerousAbove.length} roles with moderation powers sit above Garrison`,
      text: `${list}: anti-nuke can't act on members with ${one ? "it" : "them"}. Drag Garrison above ${one ? "it" : "them"} in Server Settings → Roles.`,
    });
  } else {
    checks.push({
      status: "ok",
      key: "role-order",
      title: "Role order",
      text: "Garrison's role sits above every role with moderation powers.",
    });
  }

  const channelCheck = (
    key: string,
    label: string,
    id: string | null,
    access: ChannelAccess | null,
    fix: CheckFix,
    unset: { title: string; text: string },
  ) => {
    const Label = `${label[0]?.toUpperCase()}${label.slice(1)}`;
    if (!id) return checks.push({ status: "warn", key, ...unset, fix });
    if (!access?.exists)
      return checks.push({
        status: "fix",
        key,
        title: `The ${label} channel was deleted`,
        text: "Nothing is posted there until a new one is picked.",
        fix: { ...fix, action: "Pick a new channel" },
      });
    if (!access.canPost) {
      return checks.push({
        status: "fix",
        key,
        title: `Garrison can't post in the ${label} channel`,
        text: `Give it View Channel, Send Messages and Embed Links in <#${id}>, or pick another channel.`,
        fix: { ...fix, action: "Pick another channel" },
      });
    }
    return checks.push({ status: "ok", key, title: Label, text: `<#${id}> works.` });
  };
  channelCheck("log-channel", "moderation log", h.logChannelId, h.logChannel, FIX.logChannel, {
    title: "No moderation log channel",
    text: "Warnings, timeouts and bans aren't posted anywhere for staff to see.",
  });
  if (h.alertChannelId)
    channelCheck(
      "alert-channel",
      "anti-raid alert",
      h.alertChannelId,
      h.alertChannel,
      FIX.alertChannel,
      {
        title: "",
        text: "",
      },
    );

  const roleById = new Map(h.roles.map((r) => [r.id, r]));
  if (h.verifyRoleId) {
    const role = roleById.get(h.verifyRoleId);
    if (!role)
      checks.push({
        status: "fix",
        key: "verify-role",
        title: "Verification's role was deleted",
        text: "New members can't verify until a new role is picked.",
        fix: FIX.verifyRole,
      });
    else if (role.position >= h.botTop) {
      checks.push({
        status: "fix",
        key: "verify-role",
        title: "Garrison can't give the verified role",
        text: `<@&${role.id}> sits above Garrison's role. Drag Garrison above it in Server Settings → Roles, or pick another role.`,
        fix: { ...FIX.verifyRole, action: "Pick another role" },
      });
    }
  }
  const missingStaff = h.staffRoleIds.filter((id) => !roleById.has(id));
  if (missingStaff.length) {
    const one = missingStaff.length === 1;
    checks.push({
      status: "warn",
      key: "staff-roles",
      title: `${one ? "A staff role was" : `${missingStaff.length} staff roles were`} deleted`,
      text: `Anti-raid's list of who keeps talking during a lockdown still names ${one ? "it" : "them"}.`,
      fix: FIX.staffRoles,
    });
  }

  if (!h.antiRaidEnabled)
    checks.push({
      status: "warn",
      key: "anti-raid-off",
      title: "Anti-raid is off",
      text: "Nothing locks the server when too many people join too fast.",
      fix: FIX.antiRaid,
    });
  if (!h.antiNukeEnabled)
    checks.push({
      status: "warn",
      key: "anti-nuke-off",
      title: "Anti-nuke is off",
      text: "Nothing stops a rogue admin. Only the server owner can turn it on.",
      fix: FIX.antiNuke,
    });

  const order: Record<CheckStatus, number> = { fix: 0, warn: 1, ok: 2 };
  return checks.sort((a, b) => order[a.status] - order[b.status]);
}

/** Re-invite link that grants exactly the permissions Garrison uses, for this server. */
export function fixPermissionsUrl(clientId: string, guildId: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: ALL_REQUIRED.toString(),
    guild_id: guildId,
    disable_guild_select: "true",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export const requiredPermissionNames = () => new PermissionsBitField(ALL_REQUIRED).toArray();
