import { gatehouseButtons, gatehouseCommands } from "../modules/gatehouse/commands/index.js";
import { health } from "../modules/health/command.js";
import { opsButtons, opsModals, raid } from "../modules/ops/commands.js";
import { lfg, rallyButtons } from "../modules/rally/commands.js";
import { watchButtons, watchCommands } from "../modules/watch/commands/index.js";
import type { ButtonHandler, Command, ModalHandler } from "./types.js";

export const commands: Command[] = [...watchCommands, ...gatehouseCommands, health, lfg, raid];
export const buttons: ButtonHandler[] = [
  ...watchButtons,
  ...gatehouseButtons,
  rallyButtons,
  opsButtons,
];
export const modals: ModalHandler[] = [opsModals];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
