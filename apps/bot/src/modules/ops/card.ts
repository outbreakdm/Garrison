import { capacity, type OpsEvent, type OpsSignup } from "@garrison/db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { brandEmbed } from "../../lib/embeds.js";
import { safeText } from "../../lib/text.js";

export const OPS_PREFIX = "ops";
const SHOWN_PER_ROLE = 10;

const ts = (d: Date, style: "F" | "R") => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;

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

function capped(lines: string[], more: (n: number) => string) {
  return lines.length > SHOWN_PER_ROLE
    ? [...lines.slice(0, SHOWN_PER_ROLE), more(lines.length - SHOWN_PER_ROLE)]
    : lines;
}

export function opsCard(event: OpsEvent, signups: OpsSignup[]) {
  const seated = signups.filter((s) => !s.bench);
  const bench = signups.filter((s) => s.bench);
  const total = capacity(event.slots);
  const short = shortages(event, signups);
  const scheduled = event.status === "scheduled";

  const badge =
    event.status === "cancelled"
      ? "Cancelled"
      : event.status === "done"
        ? "Done"
        : (short ?? "Ready");
  const lines = [`${ts(event.startsAt, "F")} · ${ts(event.startsAt, "R")}`];
  const extras = [`Hosted by <@${event.hostId}>`];
  if (event.repeatWeekly) extras.push("repeats weekly");
  if (scheduled) extras.push("reminders 24 h and 30 min before");
  lines.push(extras.join(" · "));
  if (event.note) lines.push(safeText(event.note));

  const fields = event.slots.map((g) => {
    const inRole = seated.filter((s) => s.role === g.name);
    const open = Math.max(0, g.count - inRole.length);
    const rows = capped(inRole.map(who), (n) => `+${n} more`);
    if (open) rows.push(open > 3 ? `Open × ${open}` : Array(open).fill("Open").join("\n"));
    return {
      name: `${safeText(g.name)} · ${inRole.length}/${g.count}`,
      value: rows.join("\n"),
      inline: true,
    };
  });
  if (bench.length) {
    fields.push({
      name: `Bench · ${bench.length}`,
      value: capped(
        bench.map((s) => `${who(s)} (${safeText(s.role)})`),
        (n) => `+${n} more`,
      ).join("\n"),
      inline: true,
    });
  }

  const embed = brandEmbed({
    title: `${safeText(event.title)} · ${badge}`,
    description: lines.join("\n"),
    fields,
    module: "ops",
    ref: `${seated.length}/${total}`,
  });
  if (!scheduled) return { embeds: [embed], components: [] };

  const join = new ActionRowBuilder<ButtonBuilder>().addComponents(
    event.slots.map((g, i) =>
      new ButtonBuilder()
        .setCustomId(`${OPS_PREFIX}:join:${event.id}:${i}`)
        .setLabel(`Sign up as ${g.name}`)
        .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
  const manage = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${OPS_PREFIX}:withdraw:${event.id}`)
      .setLabel("Withdraw")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${OPS_PREFIX}:cancel:${event.id}`)
      .setLabel("Cancel raid")
      .setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [join, manage] };
}
