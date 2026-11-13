import type { QmCreated, QmOperation } from "@garrison/db";
import { z } from "zod";

/**
 * What the model returns. Deliberately loose (flat, nullable fields) so it maps
 * cleanly to a structured-output schema; every rule that matters is enforced
 * afterwards by validatePlan, because model output is untrusted.
 */
export const AiPlanSchema = z.object({
  summary: z.string().describe("One short sentence describing the whole build."),
  operations: z.array(
    z.object({
      kind: z.enum([
        "create_category",
        "create_text_channel",
        "create_voice_channel",
        "create_role",
      ]),
      ref: z.string().describe("Short unique id for this new item, e.g. 'wardogs' or 'gold_role'."),
      name: z.string(),
      parent: z
        .string()
        .nullable()
        .describe(
          "For channels: a category ref from this plan, or an existing category id. Else null.",
        ),
      topic: z.string().nullable(),
      slowmode_seconds: z.number().int().nullable(),
      user_limit: z.number().int().nullable(),
      private_to: z
        .array(z.string())
        .describe(
          "Role refs from this plan or existing role ids that may see this channel. Empty = visible to everyone.",
        ),
      color_hex: z.string().nullable().describe("Roles only, e.g. '#d4ff3a'."),
      hoist: z.boolean().nullable(),
      mentionable: z.boolean().nullable(),
    }),
  ),
  notes: z.string().describe("Anything you could not or would not do, and why. Empty if none."),
});
export type AiPlan = z.infer<typeof AiPlanSchema>;

/** What the plan may refer to that already exists. Built from the server, never from model output. */
export interface ServerSnapshot {
  everyoneId: string;
  categories: { id: string; name: string }[];
  roles: { id: string; name: string; managed: boolean }[];
  channelCount: number;
  roleCount: number;
}

export const MAX_OPERATIONS = 20;
export const MAX_PRIVATE_ROLES = 5;
const DISCORD_CHANNEL_LIMIT = 500;
const DISCORD_ROLE_LIMIT = 250;

/** Discord text-channel names: lowercase, no spaces, 1–90 chars of letters, numbers, - and _. */
export function channelName(raw: string) {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/** Names for categories, voice channels and roles: no control characters, mentions or markdown. */
export function displayName(raw: string, max = 90) {
  return raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[@#<>*_`~|\\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type ValidationResult =
  | { ok: true; summary: string; operations: QmOperation[]; notes: string }
  | { ok: false; errors: string[] };

/**
 * Turn model output into a plan Garrison will run, or explain why not. A plan
 * with any problem is rejected whole: half a build is worse than none.
 */
export function validatePlan(raw: AiPlan, server: ServerSnapshot): ValidationResult {
  const errors: string[] = [];
  const ops: QmOperation[] = [];
  const refs = new Map<string, QmOperation["kind"]>();
  const categoryIds = new Set(server.categories.map((c) => c.id));
  const roleIds = new Set(
    server.roles.filter((r) => !r.managed && r.id !== server.everyoneId).map((r) => r.id),
  );

  if (!raw.operations.length) errors.push("The plan has no changes.");
  if (raw.operations.length > MAX_OPERATIONS)
    errors.push(
      `The plan has ${raw.operations.length} changes; the most a build can make is ${MAX_OPERATIONS}.`,
    );

  raw.operations.slice(0, MAX_OPERATIONS).forEach((op, i) => {
    const n = `Change ${i + 1}`;
    const ref = op.ref.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(ref))
      errors.push(`${n}: its ref "${op.ref.slice(0, 40)}" isn't valid.`);
    else if (refs.has(ref)) errors.push(`${n}: the ref "${ref}" is used twice.`);

    const isChannel = op.kind === "create_text_channel" || op.kind === "create_voice_channel";
    const name =
      op.kind === "create_text_channel"
        ? channelName(op.name)
        : displayName(op.name, op.kind === "create_role" ? 100 : 90);
    if (!name) errors.push(`${n}: the name is empty once cleaned up.`);

    let parent: string | null = null;
    if (isChannel && op.parent) {
      const p = op.parent.trim();
      if (refs.get(p.toLowerCase()) === "create_category") parent = p.toLowerCase();
      else if (categoryIds.has(p)) parent = p;
      else
        errors.push(
          `${n}: its category "${p.slice(0, 40)}" isn't a category in this plan or the server.`,
        );
    }

    const privateTo: string[] = [];
    if (isChannel) {
      if (op.private_to.length > MAX_PRIVATE_ROLES)
        errors.push(`${n}: it can be private to ${MAX_PRIVATE_ROLES} roles at most.`);
      for (const r of op.private_to.slice(0, MAX_PRIVATE_ROLES)) {
        const t = r.trim();
        if (refs.get(t.toLowerCase()) === "create_role") privateTo.push(t.toLowerCase());
        else if (roleIds.has(t)) privateTo.push(t);
        else
          errors.push(
            `${n}: "${t.slice(0, 40)}" isn't a role in this plan or a normal role in the server.`,
          );
      }
    }

    let color: number | null = null;
    if (op.kind === "create_role" && op.color_hex) {
      const m = op.color_hex.trim().match(/^#?([0-9a-f]{6})$/i);
      if (m?.[1]) color = Number.parseInt(m[1], 16);
      else errors.push(`${n}: "${op.color_hex.slice(0, 20)}" isn't a color like #d4ff3a.`);
    }

    const slowmode =
      op.kind === "create_text_channel" && op.slowmode_seconds ? op.slowmode_seconds : null;
    if (slowmode !== null && (slowmode < 0 || slowmode > 21_600))
      errors.push(`${n}: slowmode must be 0 to 21600 seconds.`);
    const userLimit = op.kind === "create_voice_channel" && op.user_limit ? op.user_limit : null;
    if (userLimit !== null && (userLimit < 0 || userLimit > 99))
      errors.push(`${n}: voice user limit must be 0 to 99.`);

    refs.set(ref, op.kind);
    ops.push({
      kind: op.kind,
      ref,
      name,
      parent,
      topic:
        op.kind === "create_text_channel" && op.topic ? displayName(op.topic, 300) || null : null,
      slowmodeSeconds: slowmode,
      userLimit,
      privateTo,
      color,
      hoist: op.kind === "create_role" ? Boolean(op.hoist) : false,
      mentionable: op.kind === "create_role" ? Boolean(op.mentionable) : false,
    });
  });

  const newChannels = ops.filter((o) => o.kind !== "create_role").length;
  const newRoles = ops.filter((o) => o.kind === "create_role").length;
  if (server.channelCount + newChannels > DISCORD_CHANNEL_LIMIT)
    errors.push("This would pass Discord's limit of 500 channels.");
  if (server.roleCount + newRoles > DISCORD_ROLE_LIMIT)
    errors.push("This would pass Discord's limit of 250 roles.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    summary: displayName(raw.summary, 200) || "Server changes",
    operations: ops,
    notes: displayName(raw.notes, 500),
  };
}

/** Lines for the preview: exactly what Apply will create. */
export function describePlan(ops: QmOperation[], server: ServerSnapshot) {
  const names = new Map<string, string>([
    ...ops.map((o) => [o.ref, o.name] as [string, string]),
    ...server.categories.map((c) => [c.id, c.name] as [string, string]),
    ...server.roles.map((r) => [r.id, r.name] as [string, string]),
  ]);
  return ops.map((o) => {
    const extras: string[] = [];
    if (o.parent) extras.push(`in ${names.get(o.parent) ?? "?"}`);
    if (o.privateTo.length)
      extras.push(
        `only ${o.privateTo.map((r) => `@${names.get(r) ?? "?"}`).join(", ")} can see it`,
      );
    if (o.slowmodeSeconds) extras.push(`slowmode ${o.slowmodeSeconds} s`);
    if (o.userLimit) extras.push(`limit ${o.userLimit}`);
    if (o.topic) extras.push(`topic "${o.topic}"`);
    const tail = extras.length ? ` · ${extras.join(" · ")}` : "";
    switch (o.kind) {
      case "create_category":
        return `+ Category ${o.name}${tail}`;
      case "create_text_channel":
        return `+ #${o.name}${tail}`;
      case "create_voice_channel":
        return `+ Voice ${o.name}${tail}`;
    }
    return `+ Role @${o.name} · no permissions${o.color !== null ? ` · #${o.color.toString(16).padStart(6, "0")}` : ""}${o.hoist ? " · shown separately" : ""}`;
  });
}

/** Undo order: channels first, then categories (once empty), then roles. */
export function rollbackOrder(created: QmCreated[]) {
  const rank = { channel: 0, category: 1, role: 2 } as const;
  return [...created].sort((a, b) => rank[a.kind] - rank[b.kind]);
}
