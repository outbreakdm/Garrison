import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiChatSchema } from "./planner.js";
import { READ_TOOLS } from "./tools.js";
import {
  AiPlanWireSchema,
  editFromWire,
  operationFromWire,
  orderFromWire,
  schemaLoad,
  WIRE_MAX_NULLABLE,
  WIRE_MAX_OPTIONAL,
} from "./wire.js";

/** What one request sends: the output schema and every strict tool, counted together. */
function load(schema: Parameters<typeof betaZodOutputFormat>[0], tools = READ_TOOLS) {
  const out = schemaLoad((betaZodOutputFormat(schema) as { schema: unknown }).schema);
  for (const t of tools) {
    if (!(t as { strict?: boolean }).strict) continue;
    const s = schemaLoad((t as { input_schema: unknown }).input_schema);
    out.nullable.push(...s.nullable);
    out.optional.push(...s.optional);
  }
  return out;
}

describe("what the AI is asked to write stays inside the API's schema limits", () => {
  // On 2026-11-19 the chat schema had 25 nullable fields; the API refuses over 16 with a 400
  // before the model runs, so every AI assistant message failed.
  // Then the API refused the slimmer schema too: "The compiled grammar is too large". The plan
  // left the grammar; what's compiled now is the reply, the quick replies and plan_json.
  it("the chat's grammar is small: no nullable or optional parameters, with its tools", () => {
    const { nullable, optional } = load(AiChatSchema);
    expect(nullable.length).toBeLessThanOrEqual(WIRE_MAX_NULLABLE);
    expect(optional.length).toBeLessThanOrEqual(WIRE_MAX_OPTIONAL);
    expect(nullable).toEqual([]);
    expect(optional).toEqual([]);
    const size = JSON.stringify((betaZodOutputFormat(AiChatSchema) as { schema: unknown }).schema);
    expect(size.length).toBeLessThan(1500);
  });

  it("the plan format keeps its nullable fields to the three that need it", () => {
    expect(schemaLoad(z.toJSONSchema(AiPlanWireSchema)).nullable).toHaveLength(3);
  });
});

describe("reading the model's answer back", () => {
  it("turns not-set values back into null for the checks", () => {
    expect(
      editFromWire({
        kind: "edit_role",
        id: "1",
        name: "",
        topic: null,
        slowmode_seconds: -1,
        user_limit: -1,
        nsfw: "keep",
        parent: "",
        access: null,
        sync_with_category: false,
        color_hex: "",
        hoist: "yes",
        mentionable: "no",
        permissions: null,
      }),
    ).toEqual({
      kind: "edit_role",
      id: "1",
      name: null,
      topic: null,
      slowmode_seconds: null,
      user_limit: null,
      nsfw: null,
      parent: null,
      access: null,
      sync_with_category: null,
      color_hex: null,
      hoist: true,
      mentionable: false,
      permissions: null,
    });
    // A real 0 is kept: it turns slowmode off.
    expect(
      editFromWire({
        kind: "edit_channel",
        id: "2",
        name: "lobby",
        topic: "",
        slowmode_seconds: 0,
        user_limit: -1,
        nsfw: "keep",
        parent: "none",
        access: null,
        sync_with_category: true,
        color_hex: "",
        hoist: "keep",
        mentionable: "keep",
        permissions: null,
      }),
    ).toMatchObject({
      name: "lobby",
      topic: "",
      slowmode_seconds: 0,
      parent: "none",
      sync_with_category: true,
    });
    expect(
      operationFromWire({
        kind: "create_text_channel",
        ref: "news",
        name: "news",
        parent: "",
        topic: "",
        slowmode_seconds: 0,
        user_limit: 0,
        private_to: [],
        read_only: false,
        posters: [],
        color_hex: "",
        hoist: false,
        mentionable: false,
        permissions: [],
        text_kind: "text",
      }),
    ).toMatchObject({
      parent: null,
      topic: null,
      slowmode_seconds: null,
      user_limit: null,
      read_only: null,
      color_hex: null,
      hoist: null,
      text_kind: null,
    });
    expect(orderFromWire({ scope: "channels", parent: "", items: ["a", "b"] })).toEqual({
      scope: "channels",
      parent: null,
      items: ["a", "b"],
    });
  });
});
