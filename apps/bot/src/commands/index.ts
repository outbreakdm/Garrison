import { link, roster, unlink } from "../modules/barracks/commands.js";
import { economyCommands, purchaseButtons } from "../modules/economy/commands.js";
import { gatehouseButtons, gatehouseCommands } from "../modules/gatehouse/commands/index.js";
import { questionModals } from "../modules/gatehouse/questions.js";
import { giveaway } from "../modules/giveaways/commands.js";
import { giveawayButtons } from "../modules/giveaways/handlers.js";
import { health } from "../modules/health/command.js";
import { logs } from "../modules/ledger/commands.js";
import { opsButtons, opsModals, raid } from "../modules/ops/commands.js";
import { qm, qmButtons } from "../modules/quartermaster/commands.js";
import { lfg, rallyButtons } from "../modules/rally/commands.js";
import { leaderboard, rank, rankcard, rankcardModals, ranks } from "../modules/ranks/commands.js";
import { roleMenuButtons, roleMenuSelects } from "../modules/roles/handlers.js";
import { suggest, suggestionButtons } from "../modules/suggestions/commands.js";
import { ticket, ticketButtons, ticketModals } from "../modules/tickets/handlers.js";
import { watchButtons, watchCommands } from "../modules/watch/commands/index.js";
import type { ButtonHandler, Command, ModalHandler, SelectHandler } from "./types.js";

export const commands: Command[] = [
  ...watchCommands,
  ...gatehouseCommands,
  ...economyCommands,
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
  giveaway,
  suggest,
];
export const buttons: ButtonHandler[] = [
  ...watchButtons,
  ...gatehouseButtons,
  purchaseButtons,
  rallyButtons,
  opsButtons,
  qmButtons,
  roleMenuButtons,
  ticketButtons,
  giveawayButtons,
  suggestionButtons,
];
export const selects: SelectHandler[] = [roleMenuSelects];
export const modals: ModalHandler[] = [opsModals, ticketModals, rankcardModals, questionModals];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
