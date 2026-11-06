import { gatehouseButtons, gatehouseCommands } from "../modules/gatehouse/commands/index.js";
import { health } from "../modules/health/command.js";
import { lfg, rallyButtons } from "../modules/rally/commands.js";
import { watchButtons, watchCommands } from "../modules/watch/commands/index.js";
import type { ButtonHandler, Command } from "./types.js";

export const commands: Command[] = [...watchCommands, ...gatehouseCommands, health, lfg];
export const buttons: ButtonHandler[] = [...watchButtons, ...gatehouseButtons, rallyButtons];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
