import type { EmbedTone } from "@garrison/brand";
import {
  AVAILABILITY_LABELS,
  capacity,
  isAvailability,
  type OpsEvent,
  type OpsSignup,
} from "@garrison/db";
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

/** Counted toward a role in an organized raid: coming or late (tentative shows, but isn't counted). */
const counted = (s: OpsSignup) => s.availability === "coming" || s.availability === "late";

/**
 * An organized raid's card: who's coming with which character, by role; who's tentative or
 * late; how many can't; and (for a team's raid) who hasn't answered. Members answer with the
 * four buttons; officers pick the lineup on the dashboard.
 */
export function organizedCard(event: OpsEvent, signups: OpsSignup[], waiting: string[] = []): Card {
  const scheduled = event.status === "scheduled";
  const answered = signups.filter((s) => isAvailability(s.availability));
  const cant = answered.filter((s) => s.availability === "cant");
  const short = event.slots
    .map((g) => ({
      name: g.name,
      missing: g.count - answered.filter((s) => s.role === g.name && counted(s)).length,
    }))
    .filter((g) => g.missing > 0);
  const shortText = short.map((g) => `${g.missing} ${g.name} short`).join(", ");
  const status =
    event.status === "cancelled"
      ? "Canceled"
      : event.status === "done"
        ? "Done"
        : short.length
          ? `${short.reduce((t, g) => t + g.missing, 0)} short`
          : "Ready";
  const tone: EmbedTone =
    event.status === "cancelled"
      ? "caution"
      : event.status === "done"
        ? "intel"
        : short.length
          ? "caution"
          : "go";
  const details = [`Host <@${event.hostId}>`, "officers pick the lineup"];
  if (event.repeatWeekly) details.push("repeats weekly");
  const blocks: Card["blocks"] = [
    {
      text: [details.join(" · "), event.note ? safeText(event.note) : null, shortText || null]
        .filter(Boolean)
        .join("\n"),
    },
    "divider",
  ];
  const line = (s: OpsSignup) =>
    `${who(s)}${s.availability === "coming" ? "" : ` · ${AVAILABILITY_LABELS[s.availability as "late"].toLowerCase()}`}`;
  const order = { coming: 0, late: 1, tentative: 2 } as Record<string, number>;
  if (event.lineupPostedAt && event.groups) {
    // The lineup is up: one block per group, then the bench.
    const roleOf = (s: OpsSignup) => (s.role ? ` (${safeText(s.role)})` : "");
    for (let n = 1; n <= event.groups.count; n++) {
      const inGroup = answered.filter((s) => s.groupNo === n && s.availability !== "cant");
      if (!inGroup.length) continue;
      blocks.push({
        text: [`**Group ${n}**`, ...inGroup.map((s) => `${line(s)}${roleOf(s)}`)].join("\n"),
      });
    }
    const bench = answered.filter((s) => s.bench && s.availability !== "cant");
    if (bench.length)
      blocks.push({
        text: [
          `**Bench** ${bench.length}`,
          ...capped(
            bench.map((s) => `${line(s)}${roleOf(s)}`),
            SHOWN_PER_ROLE,
          ),
        ].join("\n"),
      });
  } else
    for (const g of event.slots) {
      const inRole = answered
        .filter((s) => s.role === g.name && s.availability !== "cant")
        .sort((a, b) => (order[a.availability ?? ""] ?? 3) - (order[b.availability ?? ""] ?? 3));
      const n = inRole.filter(counted).length;
      const lines = capped(inRole.map(line), SHOWN_PER_ROLE);
      blocks.push({
        text: [`**${safeText(g.name)}** ${n}/${g.count}`, ...lines].join("\n"),
      });
    }
  const tail = [
    cant.length ? `**Can't** ${cant.length}` : null,
    waiting.length
      ? `**No reply yet** ${waiting.length}\n${capped(
          waiting.map((id) => `<@${id}>`),
          15,
        ).join(" ")}`
      : null,
  ].filter(Boolean);
  if (tail.length) blocks.push({ text: tail.join("\n") });

  const answer = (key: "coming" | "tentative" | "late" | "cant", style: ButtonStyle) =>
    new ButtonBuilder()
      .setCustomId(`${OPS_PREFIX}:avail:${event.id}:${key}`)
      .setLabel(AVAILABILITY_LABELS[key])
      .setStyle(style);
  return {
    tone,
    title: safeText(event.title),
    status,
    lead: `${ts(event.startsAt, "F")} · ${ts(event.startsAt, "R")}`,
    blocks,
    actions: scheduled
      ? [
          answer("coming", ButtonStyle.Success),
          answer("tentative", ButtonStyle.Secondary),
          answer("late", ButtonStyle.Secondary),
          answer("cant", ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`${OPS_PREFIX}:cancel:${event.id}`)
            .setLabel("Cancel raid")
            .setStyle(ButtonStyle.Danger),
        ]
      : undefined,
    module: "ops",
    ref: `${answered.filter(counted).length}/${capacity(event.slots)}`,
  };
}

/**
 * The raid card: when, who hosts, then one block per role (who's in, how many seats
 * are open) with its Sign up button beside it. A full role still signs you up: to the bench.
 */
export function opsCard(event: OpsEvent, signups: OpsSignup[], waiting: string[] = []): Card {
  if (event.style === "organized") return organizedCard(event, signups, waiting);
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
