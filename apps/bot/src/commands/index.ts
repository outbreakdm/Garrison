import { gatehouseButtons, gatehouseCommands } from "../modules/gatehouse/commands/index.js";
import { health } from "../modules/health/command.js";
import { watchButtons, watchCommands } from "../modules/watch/commands/index.js";
import type { ButtonHandler, Command } from "./types.js";

export const commands: Command[] = [...watchCommands, ...gatehouseCommands, health];
export const buttons: ButtonHandler[] = [...watchButtons, ...gatehouseButtons];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
