import {
  type BackupChannel,
  entitlements,
  getGuildPlan,
  getTemplate,
  maskPermissions,
  readBackup,
  saveTemplate,
  TEMPLATE_NAME_MAX,
  TEMPLATES_PER_USER,
  templateApplyPlan,
  toTemplate,
} from "@garrison/db";
import {
  ChannelType,
  type Guild,
  type GuildChannelCreateOptions,
  type GuildMember,
  OverwriteType,
  PermissionFlagsBits,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { createType, snapshot } from "../gatehouse/backup.js";

/**
 * Server templates (Pro): save this server's layout to your account, then copy it
 * into another server you own. Applying creates only what that server doesn't
 * have by name, with permissions limited to what Garrison holds there, and is
 * for the server owner only (checked against Discord here).
 */

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

const saveReq = z.object({ name: z.string().max(TEMPLATE_NAME_MAX) });
const applyReq = z.object({ templateId: z.string().uuid() });

async function isPro(ctx: BotContext, guildId: string) {
  return entitlements(await getGuildPlan(ctx.db, guildId))["qm.templates"];
}

export async function doTemplateSave(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  if (!(await isPro(ctx, guild.id))) return fail("Server templates are part of Garrison Pro.");
  const p = saveReq.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const data = toTemplate(snapshot(guild));
  const saved = await saveTemplate(ctx.db, {
    ownerId: member.id,
    name: p.data.name,
    sourceGuildId: guild.id,
    sourceGuildName: guild.name,
    data,
  });
  if (!saved)
    return fail(
      `You have ${TEMPLATES_PER_USER} templates already. Delete one on the Quartermaster page first.`,
    );
  return {
    ok: true,
    message: `Saved "${saved.name}": ${data.roles.length} roles and ${data.channels.length} channels. Apply it from Quartermaster in another server you own.`,
  };
}

export async function doTemplateApply(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  if (member.id !== guild.ownerId) return fail("Only the server owner can apply a template.");
  if (!(await isPro(ctx, guild.id))) return fail("Server templates are part of Garrison Pro.");
  const p = applyReq.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const row = await getTemplate(ctx.db, member.id, p.data.templateId);
  if (!row) return fail("That template was deleted, or isn't yours.");
  if (row.sourceGuildId === guild.id)
    return fail("That template is this server. To bring back what's missing, restore a backup.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels]))
    return fail("Garrison needs Manage Roles and Manage Channels to apply a template.");

  const template = readBackup(row.data);
  const plan = templateApplyPlan(template, {
    roles: [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.id)
      .map((r) => ({ id: r.id, name: r.name })),
    channels: [...guild.channels.cache.values()]
      .filter((c) => !c.isThread())
      .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null })),
  });
  const allowed = me.permissions.bitfield;
  const roleMap: Record<string, string> = { ...plan.existingRoles, [row.sourceGuildId]: guild.id };
  const categoryMap: Record<string, string> = { ...plan.existingCategories };
  const reason = `Template "${row.name}" applied by ${member.user.username}`;
  let made = 0;
  let failed = 0;
  let reduced = 0;

  for (const r of plan.roles) {
    const perms = maskPermissions(r.permissions, allowed);
    if (perms.dropped) reduced++;
    const role = await guild.roles
      .create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: perms.kept,
        reason,
      })
      .catch(() => null);
    if (role) {
      roleMap[r.id] = role.id;
      made++;
    } else failed++;
  }

  const community = guild.features.includes("COMMUNITY");
  const overwrites = (c: BackupChannel) =>
    c.overwrites.flatMap((o) => {
      const target = o.kind === "role" ? roleMap[o.id] : undefined;
      if (!target) return [];
      const allow = maskPermissions(o.allow, allowed);
      const deny = maskPermissions(o.deny, allowed);
      if (allow.dropped || deny.dropped) reduced++;
      return [{ id: target, type: OverwriteType.Role, allow: allow.kept, deny: deny.kept }];
    });
  const create = async (c: BackupChannel) => {
    const parent = c.parentId ? categoryMap[c.parentId] : undefined;
    const options: GuildChannelCreateOptions = {
      name: c.name,
      type: createType(c.type, community) as GuildChannelCreateOptions["type"],
      parent: parent ?? null,
      permissionOverwrites: overwrites(c),
      reason,
    };
    if (c.topic) options.topic = c.topic;
    if (c.nsfw) options.nsfw = true;
    if (c.rateLimit) options.rateLimitPerUser = c.rateLimit;
    if (c.userLimit) options.userLimit = c.userLimit;
    const channel = await guild.channels.create(options).catch(() => null);
    if (channel) {
      if (c.type === ChannelType.GuildCategory) categoryMap[c.id] = channel.id;
      made++;
    } else failed++;
  };
  for (const c of plan.categories) await create(c);
  for (const c of plan.channels) await create(c);

  if (!made && !failed)
    return {
      ok: true,
      message: `Nothing to add: this server already has everything in "${row.name}".`,
    };
  const notes = [
    reduced ? `${reduced} permission sets were trimmed to what Garrison holds.` : "",
    failed ? `${failed} couldn't be made.` : "",
    plan.skipped ? `${plan.skipped} were left out (at most 250 at a time).` : "",
  ].filter(Boolean);
  return {
    ok: failed === 0,
    message: `Applied "${row.name}": made ${made} roles and channels. ${notes.join(" ")}`.trim(),
  };
}
