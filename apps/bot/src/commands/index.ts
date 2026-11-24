import { commandLocalizations } from "@garrison/db";
import {
  applicationModals,
  applyButtons,
  decideApplicationButtons,
} from "../modules/applications/service.js";
import { link, roster, unlink } from "../modules/barracks/commands.js";
import { economyCommands, purchaseButtons } from "../modules/economy/commands.js";
import { shopBuyButtons, shopForms, shopPickSelects } from "../modules/economy/panel-handlers.js";
import { birthday } from "../modules/fun/birthday.js";
import { trivia, triviaButtons } from "../modules/fun/trivia.js";
import { gatehouseButtons, gatehouseCommands } from "../modules/gatehouse/commands/index.js";
import { questionModals } from "../modules/gatehouse/questions.js";
import { giveaway } from "../modules/giveaways/commands.js";
import { giveawayButtons } from "../modules/giveaways/handlers.js";
import { health } from "../modules/health/command.js";
import { logs } from "../modules/ledger/commands.js";
import { opsButtons, opsModals, raid } from "../modules/ops/commands.js";
import { qm, qmButtons } from "../modules/quartermaster/commands.js";
import { lfg, rallyButtons } from "../modules/rally/commands.js";
import { lfgPanelButtons, lfgPanelModals } from "../modules/rally/panel-handlers.js";
import { leaderboard, rank, rankcard, rankcardModals, ranks } from "../modules/ranks/commands.js";
import { tag } from "../modules/responders/commands.js";
import { roleMenuButtons, roleMenuSelects } from "../modules/roles/handlers.js";
import {
  suggest,
  suggestionButtons,
  suggestionModals,
  suggestionPanelButtons,
} from "../modules/suggestions/commands.js";
import { ticket, ticketButtons, ticketModals } from "../modules/tickets/handlers.js";
import { temprole } from "../modules/utilities/commands.js";
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
  tag,
  temprole,
  birthday,
  trivia,
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
  suggestionPanelButtons,
  lfgPanelButtons,
  shopBuyButtons,
  applyButtons,
  decideApplicationButtons,
  triviaButtons,
];
export const selects: SelectHandler[] = [roleMenuSelects, shopPickSelects];
export const modals: ModalHandler[] = [
  opsModals,
  ticketModals,
  rankcardModals,
  questionModals,
  applicationModals,
  suggestionModals,
  lfgPanelModals,
  shopForms,
];

// Each command's description in Spanish, Portuguese, German and French: Discord shows members
// the one their Discord is set to (packages/db i18n.ts).
for (const c of commands) {
  const localized = commandLocalizations(c.data.name);
  if (localized) c.data.description_localizations = localized;
}

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
