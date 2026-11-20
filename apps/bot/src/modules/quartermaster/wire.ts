import { z } from "zod";
import { type AiEdit, AiEditSchema } from "./edits.js";
import { type AiPlan, AiPlanSchema } from "./plan.js";

/**
 * What the model is asked to write, and how it's read back.
 *
 * Structured outputs compile the schema into a grammar, and the API refuses a schema with more
 * than 16 parameters that can be null (or 24 optional ones) across a request: a 400 before
 * the model runs. The plan's own schemas (AiPlanSchema, AiEditSchema) use null for "not set",
 * and by 2026-11-19 the chat schema had 25 of them, so every AI assistant message failed.
 *
 * So the model writes "not set" as a plain value instead: "" for text, -1 (or 0) for numbers,
 * "keep" for a yes/no it may leave alone. These functions turn that back into the null the
 * rest of Garrison checks, so validatePlan, validateEdits and the tests see what they always
 * did. Only three fields stay nullable, where "nothing" and "not set" differ: an edit's topic
 * ("" clears it), its access and its permissions.
 */

/** The most nullable parameters the API accepts in one request's schemas. */
export const WIRE_MAX_NULLABLE = 16;
/** The most optional parameters it accepts. */
export const WIRE_MAX_OPTIONAL = 24;

const keepYesNo = z.enum(["keep", "yes", "no"]);
const fromKeep = (v: "keep" | "yes" | "no" | null | undefined) =>
  v === "yes" ? true : v === "no" ? false : null;
/** "" (or anything blank) is "not set". */
const text = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v : null);
/** -1 (any negative) is "not set". */
const count = (v: number | null | undefined) => (typeof v === "number" && v >= 0 ? v : null);
/** 0 or less is "not set": for a new channel, 0 and none are the same. */
const positive = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : null);

export const AiEditWireSchema = z.object({
  kind: AiEditSchema.shape.kind,
  id: AiEditSchema.shape.id,
  name: z.string().describe('A new name, or "" to keep it.'),
  topic: AiEditSchema.shape.topic,
  slowmode_seconds: z.number().int().describe("0 to 21600; 0 turns it off. -1 keeps it."),
  user_limit: z.number().int().describe("Voice: 0 (no limit) to 99. -1 keeps it."),
  nsfw: keepYesNo.describe("Age-restricted: yes, no, or keep."),
  parent: z
    .string()
    .describe(
      'Channels: a category id or a category ref from this plan to move it into, "none" to take it out of its category, "" to keep.',
    ),
  access: AiEditSchema.shape.access,
  sync_with_category: z
    .boolean()
    .describe("Channels: true makes it follow its category's permissions again. Else false."),
  color_hex: z.string().describe("Roles: a color like '#d4ff3a', or \"\" to keep it."),
  hoist: keepYesNo.describe("Roles: show separately in the member list: yes, no, or keep."),
  mentionable: keepYesNo.describe("Roles: anyone can @mention it: yes, no, or keep."),
  permissions: AiEditSchema.shape.permissions,
});
type AiEditWire = z.infer<typeof AiEditWireSchema>;

const op = AiPlanSchema.shape.operations.element.shape;
export const AiOperationWireSchema = z.object({
  kind: op.kind,
  ref: op.ref,
  name: op.name,
  parent: z
    .string()
    .describe('For channels: a category ref from this plan, or an existing category id. Else "".'),
  topic: z.string().describe('Text channels: the topic. Else "".'),
  slowmode_seconds: z.number().int().describe("Text channels: seconds between messages. Else 0."),
  user_limit: z.number().int().describe("Voice channels: 1 to 99 people. Else 0 (no limit)."),
  private_to: op.private_to,
  read_only: z
    .boolean()
    .describe(
      "Channels only. Text: members can read but not post. Voice: members can listen but not speak. Else false.",
    ),
  posters: op.posters,
  color_hex: z.string().describe("Roles only, e.g. '#d4ff3a'. Else \"\"."),
  hoist: z.boolean().describe("Roles only: show separately in the member list. Else false."),
  mentionable: z.boolean().describe("Roles only: anyone can @mention it. Else false."),
  permissions: op.permissions,
  text_kind: z
    .enum(["text", "announcement", "forum"])
    .describe(
      "create_text_channel: text for a normal channel, announcement (other servers can follow it; Community servers only) or forum (members start posts; its topic is the posting guidelines). Else text.",
    ),
});
type AiOperationWire = z.infer<typeof AiOperationWireSchema>;

const order = AiPlanSchema.shape.order.element.shape;
export const AiOrderWireSchema = z.object({
  scope: order.scope,
  parent: z
    .string()
    .describe(
      'For "channels": the category id, a category ref from this plan, or "" for the channels outside any category. Else "".',
    ),
  items: order.items,
});
type AiOrderWire = z.infer<typeof AiOrderWireSchema>;

export const AiPlanWireSchema = z.object({
  summary: AiPlanSchema.shape.summary,
  operations: z.array(AiOperationWireSchema),
  notes: AiPlanSchema.shape.notes,
  order: z.array(AiOrderWireSchema).describe(AiPlanSchema.shape.order.description ?? ""),
  edits: z.array(AiEditWireSchema).describe(AiPlanSchema.shape.edits.description ?? ""),
});

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
