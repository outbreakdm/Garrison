import {
  QM_POST_KINDS,
  QM_POSTS_MAX,
  QM_SETTINGS_MODULES,
  QM_WRITE_TARGETS,
  QM_WRITES_MAX,
} from "@garrison/db";
import { z } from "zod";
import { type AiEdit, AiEditSchema } from "./edits.js";
import { type AiPlan, AiPlanSchema } from "./plan.js";

/**
 * What the model is asked to write, and how it's read back.
 *
 * The API turns a structured-output schema into a grammar, and it refuses one that's too big
 * ("The compiled grammar is too large", a 400 before the model runs), or with more than 16
 * nullable parameters. By 2026-11-19 the AI assistant's schema was both, so every message
 * failed. Now the grammar holds only the reply, the quick replies and the plan as one JSON
 * string (planner.ts AiChatSchema). The plan's shape is written out in the instructions
 * (PLAN_FORMAT) and checked here with the same schemas, then by validatePlan as before.
 *
 * In that shape "not set" is a plain value with a default: "" for text, -1 (or 0) for
 * numbers, "keep" for a yes/no it may leave alone, [] for lists. Without a grammar the model
 * may leave those out, and the defaults fill them in. These functions turn them back into
 * the null the rest of Garrison checks, so validatePlan and validateEdits see what they always
 * did. Three fields stay nullable, where "nothing" and "not set" differ: an edit's topic
 * ("" clears it), its access and its permissions.
 */

/** The most nullable parameters the API accepts in one request's grammar. */
export const WIRE_MAX_NULLABLE = 16;
/** The most optional parameters it accepts. */
export const WIRE_MAX_OPTIONAL = 24;

const keepYesNo = z.enum(["keep", "yes", "no"]).default("keep");
const fromKeep = (v: "keep" | "yes" | "no" | null | undefined) =>
  v === "yes" ? true : v === "no" ? false : null;
/** "" (or anything blank) is "not set". */
const text = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v : null);
/** -1 (any negative) is "not set". */
const count = (v: number | null | undefined) => (typeof v === "number" && v >= 0 ? v : null);
/** 0 or less is "not set": for a new channel, 0 and none are the same. */
const positive = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : null);
const ids = () => z.array(z.string()).default([]);
/** Revising: what of <previous_plan> to take out. Everything else stays (carry.ts). */
const drop = () =>
  ids().describe(
    "Only when revising <previous_plan>: the refs, edit ids, module.field names or message_ids of its changes the admin asked to take out. Everything else in <previous_plan> stays in the draft even if you leave it out, so leave this empty unless they asked to remove something.",
  );

export const AiEditWireSchema = z.object({
  kind: AiEditSchema.shape.kind,
  id: AiEditSchema.shape.id,
  name: z.string().default("").describe('A new name, or "" to keep it.'),
  topic: AiEditSchema.shape.topic.default(null),
  slowmode_seconds: z
    .number()
    .int()
    .default(-1)
    .describe("0 to 21600; 0 turns it off. -1 keeps it."),
  user_limit: z.number().int().default(-1).describe("Voice: 0 (no limit) to 99. -1 keeps it."),
  nsfw: keepYesNo.describe("Age-restricted: yes, no, or keep."),
  parent: z
    .string()
    .default("")
    .describe(
      'Channels: a category id or a category ref from this plan to move it into, "none" to take it out of its category, "" to keep.',
    ),
  access: AiEditSchema.shape.access.default(null),
  sync_with_category: z
    .boolean()
    .default(false)
    .describe("Channels: true makes it follow its category's permissions again."),
  color_hex: z.string().default("").describe("Roles: a color like '#d4ff3a', or \"\" to keep it."),
  hoist: keepYesNo.describe("Roles: show separately in the member list: yes, no, or keep."),
  mentionable: keepYesNo.describe("Roles: anyone can @mention it: yes, no, or keep."),
  permissions: AiEditSchema.shape.permissions.default(null),
});
type AiEditWire = z.infer<typeof AiEditWireSchema>;

const op = AiPlanSchema.shape.operations.element.shape;
export const AiOperationWireSchema = z.object({
  kind: op.kind,
  ref: op.ref,
  name: op.name,
  parent: z
    .string()
    .default("")
    .describe('For channels: a category ref from this plan, or an existing category id. Else "".'),
  topic: z.string().default("").describe("Text channels: the topic."),
  slowmode_seconds: z
    .number()
    .int()
    .default(0)
    .describe("Text channels: seconds between messages."),
  user_limit: z.number().int().default(0).describe("Voice channels: 1 to 99 people; 0 no limit."),
  private_to: ids().describe(op.private_to.description ?? ""),
  read_only: z
    .boolean()
    .default(false)
    .describe(
      "Channels only. Text: members can read but not post. Voice: members can listen but not speak.",
    ),
  posters: ids().describe(op.posters.description ?? ""),
  color_hex: z.string().default("").describe("Roles only, e.g. '#d4ff3a'."),
  hoist: z.boolean().default(false).describe("Roles only: show separately in the member list."),
  mentionable: z.boolean().default(false).describe("Roles only: anyone can @mention it."),
  permissions: op.permissions.default([]),
  text_kind: z
    .enum(["text", "announcement", "forum"])
    .default("text")
    .describe(
      "create_text_channel: text for a normal channel, announcement (other servers can follow it; Community servers only) or forum (members start posts; its topic is the posting guidelines).",
    ),
});
type AiOperationWire = z.infer<typeof AiOperationWireSchema>;

const order = AiPlanSchema.shape.order.element.shape;
export const AiOrderWireSchema = z.object({
  scope: order.scope,
  parent: z
    .string()
    .default("")
    .describe(
      'For "channels": the category id, a category ref from this plan, or "" for the channels outside any category.',
    ),
  items: order.items,
});
type AiOrderWire = z.infer<typeof AiOrderWireSchema>;

/** The one-shot planner's answer (/qm build). */
export const AiPlanWireSchema = z.object({
  summary: AiPlanSchema.shape.summary,
  operations: z.array(AiOperationWireSchema).default([]),
  notes: AiPlanSchema.shape.notes.default(""),
  order: z
    .array(AiOrderWireSchema)
    .default([])
    .describe(AiPlanSchema.shape.order.description ?? ""),
  edits: z
    .array(AiEditWireSchema)
    .default([])
    .describe(AiPlanSchema.shape.edits.description ?? ""),
  drop: drop(),
});

/** A plan the chat drafts: the one-shot plan's parts, and settings, posts and writes. */
export const AiDraftWireSchema = z.object({
  plan_summary: z.string().default("").describe("One short sentence describing the plan."),
  operations: AiPlanWireSchema.shape.operations,
  order: AiPlanWireSchema.shape.order,
  edits: AiPlanWireSchema.shape.edits,
  drop: drop(),
  plan_notes: z.string().default("").describe("What you left out or would add next."),
  settings: z
    .array(
      z.object({
        module: z.enum(QM_SETTINGS_MODULES as [string, ...string[]]),
        field: z.string(),
        value_json: z
          .string()
          .describe('The new value as JSON: true, 5, "channel-ref", ["123"], null.'),
      }),
    )
    .default([])
    .describe("Settings the plan changes, one per field."),
  posts: z
    .array(
      z.object({
        kind: z.enum(QM_POST_KINDS),
        item_id: z.string().describe("The saved item's id, from server_overview."),
        channel: z.string().describe("A text channel id, or the ref of one this plan creates."),
      }),
    )
    .default([])
    .describe(`Saved items the plan posts, at most ${QM_POSTS_MAX}.`),
  writes: z
    .array(
      z.object({
        target: z.enum(QM_WRITE_TARGETS),
        message_id: z
          .string()
          .default("")
          .describe(
            "edit_message: the saved message's id from server_overview. new_message, new_role_menu, new_ticket_panel: a short ref (like 'rules') a post in this plan can use as its item_id.",
          ),
        name: z
          .string()
          .default("")
          .describe("New items: its name on its dashboard page (40 characters at most)."),
        title: z.string().describe("The card's title: one line, 150 characters at most."),
        body: z
          .string()
          .default("")
          .describe(
            "The card's text in Discord markdown, paragraphs separated by a blank line, 3000 characters at most. Welcome cards can use {user}, {name}, {server} and {count}.",
          ),
        style: z
          .enum(["buttons", "dropdown"])
          .default("buttons")
          .describe("new_role_menu: buttons (up to 15 roles) or a dropdown (up to 25)."),
        items: z
          .array(
            z.object({
              role: z
                .string()
                .default("")
                .describe("new_role_menu: the role's id, or the ref of one this plan makes."),
              label: z
                .string()
                .describe("The button label, or the ticket topic (80 characters at most)."),
              emoji: z.string().default("").describe("One standard emoji, or empty."),
            }),
          )
          .default([])
          .describe(
            "new_role_menu: the roles members pick. new_ticket_panel: its topics, one button each.",
          ),
        staff_roles: ids().describe(
          "new_ticket_panel: role ids or refs that see and answer its tickets (added to the server's ticket staff).",
        ),
        channel: z
          .string()
          .default("")
          .describe("new_giveaway: the text channel's id, or the ref of one this plan makes."),
        winners: z.number().int().default(0).describe("new_giveaway: how many win, 1-20."),
        duration_minutes: z
          .number()
          .int()
          .default(0)
          .describe(
            "new_giveaway: minutes until the draw: 30, 60, 360, 720, 1440, 4320, 10080 or 20160.",
          ),
      }),
    )
    .default([])
    .describe(`Text the plan writes, at most ${QM_WRITES_MAX}.`),
});
export type AiDraftWire = z.infer<typeof AiDraftWireSchema>;

/** A schema as compact JSON Schema, for the instructions: fields, kinds, defaults, notes. */
export function formatText(schema: z.ZodType) {
  return JSON.stringify(z.toJSONSchema(schema, { io: "input", reused: "ref" }));
}

/**
 * The model's plan JSON, checked against `schema` with its defaults filled in. Code fences
 * are tolerated. On a problem, a short list of what's wrong, in the model's own field names,
 * so it can fix it.
 */
export function readPlanJson<S extends z.ZodType>(
  schema: S,
  raw: string,
): { ok: true; value: z.infer<S> } | { ok: false; error: string } {
  const json = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      error: `plan_json isn't valid JSON (${(error as Error).message.slice(0, 120)}).`,
    };
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const problems = parsed.error.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "plan"}: ${i.message}`);
  return { ok: false, error: `plan_json doesn't match the plan format: ${problems.join("; ")}.` };
}

export function editFromWire(e: AiEditWire): AiEdit {
  return {
    kind: e.kind,
    id: e.id,
    name: text(e.name),
    topic: e.topic ?? null,
    slowmode_seconds: count(e.slowmode_seconds),
    user_limit: count(e.user_limit),
    nsfw: fromKeep(e.nsfw),
    parent: text(e.parent),
    access: e.access ?? null,
    sync_with_category: e.sync_with_category ? true : null,
    color_hex: text(e.color_hex),
    hoist: fromKeep(e.hoist),
    mentionable: fromKeep(e.mentionable),
    permissions: e.permissions ?? null,
  };
}

export function operationFromWire(o: AiOperationWire): AiPlan["operations"][number] {
  return {
    kind: o.kind,
    ref: o.ref,
    name: o.name,
    parent: text(o.parent),
    topic: text(o.topic),
    slowmode_seconds: positive(o.slowmode_seconds),
    user_limit: positive(o.user_limit),
    private_to: o.private_to,
    read_only: o.read_only === true ? true : null,
    posters: o.posters,
    color_hex: text(o.color_hex),
    hoist: o.hoist === true ? true : null,
    mentionable: o.mentionable === true ? true : null,
    permissions: o.permissions,
    text_kind: o.text_kind && o.text_kind !== "text" ? o.text_kind : null,
  };
}

export const orderFromWire = (o: AiOrderWire): NonNullable<AiPlan["order"]>[number] => ({
  scope: o.scope,
  parent: text(o.parent),
  items: o.items,
});

export function planFromWire(p: z.infer<typeof AiPlanWireSchema>): AiPlan {
  return {
    summary: p.summary,
    operations: p.operations.map(operationFromWire),
    notes: p.notes,
    order: p.order.map(orderFromWire),
    edits: p.edits.map(editFromWire),
    ...(p.drop.length ? { drop: p.drop } : {}),
  };
}

/** Giveaway numbers the model left unset (-1, 0) come back as null. */
export const wireCount = positive;

/** Every parameter in a JSON schema that can be null, and every optional one, by path. */
export function schemaLoad(schema: unknown) {
  const nullable: string[] = [];
  const optional: string[] = [];
  const walk = (s: unknown, path: string) => {
    if (!s || typeof s !== "object") return;
    const o = s as Record<string, unknown>;
    if (o.properties && typeof o.properties === "object") {
      const required = new Set((o.required as string[] | undefined) ?? []);
      for (const [k, v] of Object.entries(o.properties as Record<string, unknown>)) {
        const p = (v ?? {}) as Record<string, unknown>;
        if (!required.has(k)) optional.push(`${path}.${k}`);
        if (Array.isArray(p.type) || p.anyOf) nullable.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
    }
    if (o.items) walk(o.items, `${path}[]`);
    for (const k of ["anyOf", "allOf"] as const)
      if (Array.isArray(o[k])) for (const x of o[k] as unknown[]) walk(x, path);
    if (o.$defs && typeof o.$defs === "object")
      for (const [k, v] of Object.entries(o.$defs as Record<string, unknown>))
        walk(v, `$defs.${k}`);
  };
  walk(schema, "$");
  return { nullable, optional };
}
