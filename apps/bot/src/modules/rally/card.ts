import type { EmbedTone } from "@garrison/brand";
import { capacity, type LfgMember, type LfgPost, renderWording } from "@garrison/db";
import { ButtonBuilder, ButtonStyle } from "discord.js";
import { type Card, capped, ts } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { postWording } from "./templates.js";

export { safeText };

export const RALLY_PREFIX = "rally";
const SHOWN_PER_ROLE = 10;

function statusOf(
  post: LfgPost,
  filled: number,
  total: number,
): { label: string; tone: EmbedTone } {
  if (post.status === "closed") return { label: "Closed", tone: "caution" };
  if (post.status === "expired") return { label: "Expired", tone: "caution" };
  if (post.status === "full" || filled >= total) return { label: "Full", tone: "go" };
  const left = total - filled;
  return { label: left === 1 ? "1 left" : `${left} open`, tone: "volt" };
}

/** Button labels are plain text; keep them inside Discord's 80 characters and never empty. */
const label = (text: string, fallback: string) => (text || fallback).slice(0, 80);

/**
 * The LFG card, in the post's own wording: one line per role with who's in and how many
 * seats are open, each with its Join button beside it; Leave and Close underneath.
 */
export function lfgCard(post: LfgPost, members: LfgMember[]): Card {
  const total = capacity(post.slots);
  const status = statusOf(post, members.length, total);
  const active = post.status === "open" || post.status === "full";
  const w = postWording(post.wording);

  const lead = [
    `Host <@${post.hostId}>`,
    post.startsAt.getTime() <= Date.now() + 60_000 ? "starts now" : `starts ${ts(post.startsAt)}`,
  ];
  if (post.repeatWeekly && active) lead.push("weekly");
  if (post.note)
    lead.push(
      w.requirement ? `${safeText(w.requirement)}: ${safeText(post.note)}` : safeText(post.note),
    );

  const blocks: Card["blocks"] = post.slots.map((group, i) => {
    const inGroup = members.filter((m) => m.slotName === group.name);
    const open = Math.max(0, group.count - inGroup.length);
    const name = group.name ? safeText(group.name) : safeText(renderWording("{Group}", w));
    const seats = [
      ...capped(
        inGroup.map((m) => `<@${m.userId}>`),
        SHOWN_PER_ROLE,
      ),
      ...(open ? [`${open} open`] : []),
    ];
    const button = active
      ? new ButtonBuilder()
          .setCustomId(`${RALLY_PREFIX}:join:${post.id}:${i}`)
          .setLabel(
            label(
              group.name
                ? renderWording(w.join, w, { role: group.name })
                : renderWording(w.joinAny, w),
              "Join",
            ),
          )
          .setStyle(open && post.status !== "full" ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(post.status === "full" || !open)
      : undefined;
    return {
      text: `**${name}** ${inGroup.length}/${group.count}\n${seats.join(" · ")}`,
      button,
    };
  });

  return {
    tone: status.tone,
    title: safeText(post.title),
    status: status.label,
    lead: lead.join(" · "),
    blocks,
    actions: active
      ? [
          new ButtonBuilder()
            .setCustomId(`${RALLY_PREFIX}:leave:${post.id}`)
            .setLabel(label(renderWording(w.leave, w), "Leave"))
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`${RALLY_PREFIX}:close:${post.id}`)
            .setLabel(label(renderWording(w.close, w), "Close"))
            .setStyle(ButtonStyle.Danger),
        ]
      : undefined,
    module: "rally",
    ref: `${members.length}/${total}`,
  };
}
