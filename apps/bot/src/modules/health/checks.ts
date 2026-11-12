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
    module: "Watch",
    bits:
      P.ModerateMembers | P.KickMembers | P.BanMembers | P.ManageMessages | P.ReadMessageHistory,
    why: "for timeouts, kicks, bans and /purge",
  },
  {
    module: "Gatehouse",
    bits: P.ManageChannels | P.ManageRoles | P.ManageGuild | P.ViewAuditLog,
    why: "for lockdowns, verification, pausing invites and anti-nuke",
  },
  { module: "Rally", bits: P.Connect, why: "to open voice channels for full squads" },
  {
    module: "Profile",
    bits: P.ChangeNickname,
    why: "to use the nickname set for it on the dashboard",
    optional: true,
  },
];

export const ALL_REQUIRED = REQUIRED_PERMISSIONS.reduce((acc, r) => acc | r.bits, 0n);

export type CheckStatus = "ok" | "fix" | "warn";
export interface Check {
  status: CheckStatus;
  text: string;
}

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
        text: `${req.module}: I'm missing ${permissionNames(missing)}, ${req.why}.`,
      });
    }
  }
  if (isAdmin) {
    checks.push({
      status: "warn",
      text: "Garrison has Administrator. It doesn't need it: re-invite it with Fix permissions, then take Administrator away.",
    });
  } else if (has(ALL_REQUIRED)) {
    checks.push({ status: "ok", text: "Garrison has every permission it uses, and nothing more." });
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
    checks.push({
      status: "fix",
      text: `${dangerousAbove.length === 1 ? "A role" : `${dangerousAbove.length} roles`} with moderation powers ${dangerousAbove.length === 1 ? "sits" : "sit"} above Garrison: ${list}. Anti-nuke can't act on members with ${dangerousAbove.length === 1 ? "it" : "them"}. Drag Garrison above ${dangerousAbove.length === 1 ? "it" : "them"} in Server Settings → Roles.`,
    });
  } else {
    checks.push({
      status: "ok",
      text: "Garrison's role sits above every role with moderation powers.",
    });
  }

  const channelCheck = (
    label: string,
    id: string | null,
    access: ChannelAccess | null,
    unsetText: string,
  ) => {
    if (!id) return checks.push({ status: "warn", text: unsetText });
    if (!access?.exists)
      return checks.push({
        status: "fix",
        text: `The ${label} channel was deleted. Pick a new one.`,
      });
    if (!access.canPost) {
      return checks.push({
        status: "fix",
        text: `I can't post in <#${id}>. Give Garrison View Channel, Send Messages and Embed Links there.`,
      });
    }
    return checks.push({
      status: "ok",
      text: `${label[0]?.toUpperCase()}${label.slice(1)} channel <#${id}> works.`,
    });
  };
  channelCheck(
    "log",
    h.logChannelId,
    h.logChannel,
    "Cases aren't logged anywhere. Set a channel with /moderation log_channel.",
  );
  if (h.alertChannelId) channelCheck("alert", h.alertChannelId, h.alertChannel, "");

  const roleById = new Map(h.roles.map((r) => [r.id, r]));
  if (h.verifyRoleId) {
    const role = roleById.get(h.verifyRoleId);
    if (!role)
      checks.push({
        status: "fix",
        text: "The verified role was deleted. Run /verify setup again.",
      });
    else if (role.position >= h.botTop) {
      checks.push({
        status: "fix",
        text: `I can't give <@&${role.id}>: my role sits below it. Drag Garrison above it.`,
      });
    }
  }
  const missingStaff = h.staffRoleIds.filter((id) => !roleById.has(id));
  if (missingStaff.length) {
    checks.push({
      status: "warn",
      text: `${missingStaff.length} staff ${missingStaff.length === 1 ? "role was" : "roles were"} deleted. Remove ${missingStaff.length === 1 ? "it" : "them"} with /security staff_role_remove.`,
    });
  }

  if (!h.antiRaidEnabled)
    checks.push({ status: "warn", text: "Anti-raid is off. Turn it on with /security anti_raid." });
  if (!h.antiNukeEnabled)
    checks.push({
      status: "warn",
      text: "Anti-nuke is off. The owner can turn it on with /security anti_nuke.",
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
