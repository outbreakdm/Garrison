import { DEFAULT_PLACEHOLDER, type Entitlements, type RoleMenu } from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { customCardMessage } from "../../lib/card.js";
import { componentEmoji } from "../../lib/emoji.js";
import { DANGEROUS_PERMISSIONS } from "../gatehouse/nuke.js";
import type { RoleFacts } from "../ranks/rules.js";

/**
 * How a role menu looks in Discord: the card designed on the dashboard, with the
 * menu's buttons or dropdown under it. Custom IDs carry the menu and role IDs, so
 * a click is always checked against the menu as it's saved now, not as posted.
 */

export const MENU_PREFIX = "rm";
export const buttonId = (menuId: string, roleId: string) => `${MENU_PREFIX}:${menuId}:${roleId}`;
export const selectId = (menuId: string) => `${MENU_PREFIX}:${menuId}`;

/** `rm:<menuId>:<roleId>` for buttons, `rm:<menuId>` for the dropdown. */
export function parseMenuId(customId: string): { menuId: string; roleId: string | null } | null {
  const m = customId.match(/^rm:([a-z0-9]{6,16})(?::(\d{17,20}))?$/);
  return m?.[1] ? { menuId: m[1], roleId: m[2] ?? null } : null;
}

export function menuRows(menu: RoleMenu): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  if (!menu.options.length) return [];
  if (menu.style === "dropdown") {
    const select = new StringSelectMenuBuilder()
      .setCustomId(selectId(menu.id))
      .setPlaceholder(menu.placeholder ?? DEFAULT_PLACEHOLDER)
      // Zero lets a member clear everything they picked from this menu.
      .setMinValues(0)
      .setMaxValues(Math.min(menu.maxPicks ?? menu.options.length, menu.options.length))
      .addOptions(
        menu.options.map((o) => {
          const option = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.roleId);
          if (o.description) option.setDescription(o.description);
          const emoji = o.emoji ? componentEmoji(o.emoji) : null;
          if (emoji) option.setEmoji(emoji);
          return option;
        }),
      );
    return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select)];
  }
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (let i = 0; i < menu.options.length; i += 5) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        menu.options.slice(i, i + 5).map((o) => {
          const button = new ButtonBuilder()
            .setCustomId(buttonId(menu.id, o.roleId))
            .setLabel(o.label)
            .setStyle(ButtonStyle.Secondary);
          const emoji = o.emoji ? componentEmoji(o.emoji) : null;
          if (emoji) button.setEmoji(emoji);
          return button;
        }),
      ),
    );
  }
  return rows;
}

export const roleMenuMessage = (menu: RoleMenu, ent: Entitlements) =>
  customCardMessage(menu.card, ent, menuRows(menu));

export type MenuRoleProblem = "missing" | "everyone" | "managed" | "dangerous" | "above_bot";

/**
 * Can a role menu hand out this role? Never @everyone, an integration's role, a
 * role above Garrison, or one with moderation or admin powers: anyone could press
 * a button and take them. Checked when a menu is posted and on every click.
 */
export function menuRoleProblem(
  role: RoleFacts | undefined,
  everyoneId: string,
  botTop: number,
): MenuRoleProblem | null {
  if (!role) return "missing";
  if (role.id === everyoneId) return "everyone";
  if (role.managed) return "managed";
  if ((role.permissions & DANGEROUS_PERMISSIONS) !== 0n) return "dangerous";
  if (role.position >= botTop) return "above_bot";
  return null;
}

/** The problem in words. `name` is how to refer to the role: a mention in Discord, a name on the dashboard. */
export function menuRoleProblemText(problem: MenuRoleProblem, name: string) {
  switch (problem) {
    case "missing":
      return `A role in this menu was deleted. Ask a moderator to fix the menu on the dashboard.`;
    case "everyone":
      return "@everyone can't be in a role menu.";
    case "managed":
      return `${name} belongs to an integration, so Garrison can't give it.`;
    case "dangerous":
      return `${name} has moderation or admin powers, so a role menu can't hand it out.`;
    case "above_bot":
      return `Garrison's role sits below ${name}. Drag Garrison above it in Server Settings → Roles.`;
  }
}
