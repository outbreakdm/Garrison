import type { Db } from "@garrison/db";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { Logger } from "../lib/logger.js";

export interface BotContext {
  db: Db;
  logger: Logger;
}

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction<"cached">, ctx: BotContext): Promise<void>;
}

/** Handles buttons whose custom ID starts with `prefix:`. */
export interface ButtonHandler {
  prefix: string;
  execute(interaction: ButtonInteraction<"cached">, ctx: BotContext): Promise<void>;
}

/** Handles modal (form) submissions whose custom ID starts with `prefix:`. */
export interface ModalHandler {
  prefix: string;
  execute(interaction: ModalSubmitInteraction<"cached">, ctx: BotContext): Promise<void>;
}
