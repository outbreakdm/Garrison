import { link, roster, unlink } from "../modules/barracks/commands.js";
import { gatehouseButtons, gatehouseCommands } from "../modules/gatehouse/commands/index.js";
import { health } from "../modules/health/command.js";
import { logs } from "../modules/ledger/commands.js";
import { opsButtons, opsModals, raid } from "../modules/ops/commands.js";
import { qm, qmButtons } from "../modules/quartermaster/commands.js";
import { lfg, rallyButtons } from "../modules/rally/commands.js";
import { leaderboard, rank, rankcard, rankcardModals, ranks } from "../modules/ranks/commands.js";
import { roleMenuButtons, roleMenuSelects } from "../modules/roles/handlers.js";
import { ticket, ticketButtons, ticketModals } from "../modules/tickets/handlers.js";
import { watchButtons, watchCommands } from "../modules/watch/commands/index.js";
import type { ButtonHandler, Command, ModalHandler, SelectHandler } from "./types.js";

export const commands: Command[] = [
  ...watchCommands,
  ...gatehouseCommands,
  health,
  lfg,
  raid,
  rank,
  leaderboard,
  ranks,
  rankcard,
  logs,
  qm,
  link,
  unlink,
  roster,
  ticket,
];
export const buttons: ButtonHandler[] = [
  ...watchButtons,
  ...gatehouseButtons,
  rallyButtons,
  opsButtons,
  qmButtons,
  roleMenuButtons,
  ticketButtons,
];
export const selects: SelectHandler[] = [roleMenuSelects];
export const modals: ModalHandler[] = [opsModals, ticketModals, rankcardModals];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
