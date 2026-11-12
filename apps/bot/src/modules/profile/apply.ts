import { checkProfileRequest, entitlements, getGuildPlan } from "@garrison/db";
import { type Guild, PermissionFlagsBits, Routes } from "discord.js";
import type { BotContext } from "../../commands/types.js";

type Outcome = { ok: boolean; message: string };

const NAMES = { nick: "nickname", avatar: "avatar", banner: "banner", bio: "bio" } as const;

/** "nickname, avatar and bio" */
export const listWords = (words: string[]) =>
  words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/**
 * Change how Garrison looks in one server (Discord's Modify Current Member). The
 * request is checked again here, against the plan as it is now. Fields left out
 * stay as they are; null puts back Garrison's own.
 */
export async function applyBotProfile(
  ctx: BotContext,
  guild: Guild,
  raw: unknown,
): Promise<Outcome> {
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const checked = checkProfileRequest(raw, ent);
  if (!checked.ok) return { ok: false, message: checked.error };
  const body = checked.value;
  if (body.nick !== undefined) {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    if (!me.permissions.has(PermissionFlagsBits.ChangeNickname))
      return {
        ok: false,
        message:
          "Garrison needs the Change Nickname permission. Turn it on for Garrison's role in Server Settings → Roles.",
      };
  }
  await guild.client.rest.patch(Routes.guildMember(guild.id, "@me"), {
    body,
    reason: "Profile changed on the Garrison dashboard",
  });
  await guild.members.fetchMe({ force: true }).catch(() => null);
  const set = (Object.keys(body) as (keyof typeof body)[]).filter((k) => body[k] !== null);
  const reset = (Object.keys(body) as (keyof typeof body)[]).filter((k) => body[k] === null);
  const parts = [
    set.length ? `Updated Garrison's ${listWords(set.map((k) => NAMES[k]))}` : null,
    reset.length ? `put back its own ${listWords(reset.map((k) => NAMES[k]))}` : null,
  ].filter(Boolean);
  const text = parts.join(", and ");
  return { ok: true, message: `${text.charAt(0).toUpperCase()}${text.slice(1)} in this server.` };
}
