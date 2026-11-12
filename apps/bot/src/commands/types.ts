import type { Db } from "@garrison/db";
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  StringSelectMenuInteraction,
} from "discord.js";
import type { Logger } from "../lib/logger.js";
import type { Metrics } from "../lib/metrics.js";
import type { Planner } from "../modules/quartermaster/planner.js";

export interface BotContext {
  db: Db;
  logger: Logger;
  /** Quartermaster's planner. Absent when no Claude API key is configured. */
  planner?: Planner;
  /** Activity and response-time counters. Absent in tests. */
  metrics?: Metrics;
  /** The dashboard's address, for links Garrison posts. */
  appUrl?: string;
}

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction<"cached">, ctx: BotContext): Promise<void>;
  /** Suggestions while someone types an option marked autocomplete. */
  autocomplete?(interaction: AutocompleteInteraction<"cached">, ctx: BotContext): Promise<void>;
}

/** Handles buttons whose custom ID starts with `prefix:`. */
export interface ButtonHandler {
  prefix: string;
  execute(interaction: ButtonInteraction<"cached">, ctx: BotContext): Promise<void>;
}

/** Handles dropdowns (string selects) whose custom ID starts with `prefix:`. */
export interface SelectHandler {
  prefix: string;
  execute(interaction: StringSelectMenuInteraction<"cached">, ctx: BotContext): Promise<void>;
}

/** Handles modal (form) submissions whose custom ID starts with `prefix:`. */
export interface ModalHandler {
  prefix: string;
  execute(interaction: ModalSubmitInteraction<"cached">, ctx: BotContext): Promise<void>;
}
