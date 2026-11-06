import type { EmbedTone } from "@garrison/brand";
import { capacity, type LfgMember, type LfgPost } from "@garrison/db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { brandEmbed } from "../../lib/embeds.js";
import { safeText } from "../../lib/text.js";

export { safeText };

export const RALLY_PREFIX = "rally";

const ts = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;

function statusLine(post: LfgPost, filled: number, total: number) {
  if (post.status === "closed") return { label: "Closed", tone: "caution" as EmbedTone };
  if (post.status === "expired") return { label: "Expired", tone: "caution" as EmbedTone };
  if (post.status === "full" || filled >= total) return { label: "Full", tone: "go" as EmbedTone };
  const left = total - filled;
  return { label: left === 1 ? "1 left" : "Open", tone: "volt" as EmbedTone };
}

/** The LFG card: one embed plus Join/Leave/Close buttons. Embeds never ping. */
export function lfgCard(post: LfgPost, members: LfgMember[]) {
  const total = capacity(post.slots);
  const status = statusLine(post, members.length, total);
  const active = post.status === "open" || post.status === "full";
  const starts =
    post.startsAt.getTime() <= Date.now() + 60_000 ? "now" : `starts ${ts(post.startsAt)}`;

  const meta = [`<@${post.hostId}>`, starts];
  if (post.note) meta.push(safeText(post.note));

  const fields = post.slots.map((group, i) => {
    const inGroup = members.filter((m) => m.slotName === group.name);
    const lines = inGroup.map((m) => `<@${m.userId}>`);
    for (let k = inGroup.length; k < group.count; k++) lines.push("Open");
    const shown = lines.length > 10 ? [...lines.slice(0, 10), `+${lines.length - 10} more`] : lines;
    return {
      name: `${group.name ? safeText(group.name) : "Squad"} · ${inGroup.length}/${group.count}`,
      value: shown.join("\n"),
      inline: post.slots.length > 1 && i < 3,
    };
  });

  const embed = brandEmbed({
    tone: status.tone,
    title: `${safeText(post.title)} · ${status.label}`,
    description: meta.join(" · "),
    fields,
    module: "rally",
    ref: `${members.length}/${total}`,
  });

  if (!active) return { embeds: [embed], components: [] };

  const full = post.status === "full";
  const join = new ActionRowBuilder<ButtonBuilder>().addComponents(
    post.slots.map((group, i) => {
      const taken = members.filter((m) => m.slotName === group.name).length;
      return new ButtonBuilder()
        .setCustomId(`${RALLY_PREFIX}:join:${post.id}:${i}`)
        .setLabel(group.name ? `Join as ${group.name}` : "Join")
        .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(full || taken >= group.count);
    }),
  );
  const manage = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RALLY_PREFIX}:leave:${post.id}`)
      .setLabel("Leave")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${RALLY_PREFIX}:close:${post.id}`)
      .setLabel("Close group")
      .setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [join, manage] };
}
