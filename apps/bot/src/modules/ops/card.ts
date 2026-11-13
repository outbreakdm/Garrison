import type { EmbedTone } from "@garrison/brand";
import { capacity, type OpsEvent, type OpsSignup } from "@garrison/db";
import { ButtonBuilder, ButtonStyle } from "discord.js";
import { type Card, capped, ts } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";

export const OPS_PREFIX = "ops";
const SHOWN_PER_ROLE = 10;

/** "2 Tank short, 1 Healer short", or null when every role is filled. */
export function shortages(event: OpsEvent, signups: OpsSignup[]) {
  const short = event.slots
    .map((g) => ({
      name: g.name,
      missing: g.count - signups.filter((s) => s.role === g.name && !s.bench).length,
    }))
    .filter((g) => g.missing > 0);
  return short.length ? short.map((g) => `${g.missing} ${g.name} short`).join(", ") : null;
}

const who = (s: OpsSignup) => (s.spec ? `<@${s.userId}> · ${safeText(s.spec)}` : `<@${s.userId}>`);

/**
 * The raid card: when, who hosts, then one block per role (who's in, how many seats
 * are open) with its Sign up button beside it. A full role still signs you up: to the bench.
 */
export function opsCard(event: OpsEvent, signups: OpsSignup[]): Card {
  const seated = signups.filter((s) => !s.bench);
  const bench = signups.filter((s) => s.bench);
  const total = capacity(event.slots);
  const short = shortages(event, signups);
  const scheduled = event.status === "scheduled";
  const openSeats = event.slots.reduce(
    (sum, g) => sum + Math.max(0, g.count - seated.filter((s) => s.role === g.name).length),
    0,
  );

  const status =
    event.status === "cancelled"
      ? "Canceled"
      : event.status === "done"
        ? "Done"
        : openSeats === 0
          ? "Ready"
          : openSeats === 1
            ? "1 left"
            : `${openSeats} open`;
  const tone: EmbedTone =
    event.status === "cancelled"
      ? "caution"
      : event.status === "done"
        ? "intel"
        : short
          ? "caution"
          : "go";

  const details = [`Host <@${event.hostId}>`];
  if (event.repeatWeekly) details.push("repeats weekly");
  if (scheduled) details.push("reminders 24 h and 30 min before");

  const blocks: Card["blocks"] = [
    {
      text: [details.join(" · "), event.note ? safeText(event.note) : null]
        .filter(Boolean)
        .join("\n"),
    },
    "divider",
  ];
  event.slots.forEach((g, i) => {
    const inRole = seated.filter((s) => s.role === g.name);
    const open = Math.max(0, g.count - inRole.length);
    const lines = [...capped(inRole.map(who), SHOWN_PER_ROLE), ...(open ? [`${open} open`] : [])];
    blocks.push({
      text: `**${safeText(g.name)}** ${inRole.length}/${g.count}\n${lines.join("\n")}`,
      button: scheduled
        ? new ButtonBuilder()
            .setCustomId(`${OPS_PREFIX}:join:${event.id}:${i}`)
            .setLabel(`Sign up as ${g.name}`.slice(0, 80))
            .setStyle(open ? ButtonStyle.Primary : ButtonStyle.Secondary)
        : undefined,
    });
  });
  if (bench.length)
    blocks.push({
      text: `**Bench** ${bench.length}\n${capped(
        bench.map((s) => `${who(s)} (${safeText(s.role)})`),
        SHOWN_PER_ROLE,
      ).join("\n")}`,
    });

  return {
    tone,
    title: safeText(event.title),
    status,
    lead: `${ts(event.startsAt, "F")} · ${ts(event.startsAt, "R")}`,
    blocks,
    actions: scheduled
      ? [
          new ButtonBuilder()
            .setCustomId(`${OPS_PREFIX}:withdraw:${event.id}`)
            .setLabel("Withdraw")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`${OPS_PREFIX}:cancel:${event.id}`)
            .setLabel("Cancel raid")
            .setStyle(ButtonStyle.Danger),
        ]
      : undefined,
    module: "ops",
    ref: `${seated.length}/${total}`,
  };
}
