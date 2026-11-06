import { watchButtons, watchCommands } from "../modules/watch/commands/index.js";
import type { ButtonHandler, Command } from "./types.js";

export const commands: Command[] = [...watchCommands];
export const buttons: ButtonHandler[] = [...watchButtons];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
