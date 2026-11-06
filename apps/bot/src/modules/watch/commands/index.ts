import type { ButtonHandler, Command } from "../../../commands/types.js";
import { ban } from "./ban.js";
import { caseCommand } from "./case.js";
import { history } from "./history.js";
import { kick } from "./kick.js";
import { moderation } from "./moderation.js";
import { purge } from "./purge.js";
import { timeout } from "./timeout.js";
import { undoButton } from "./undo.js";
import { warn } from "./warn.js";

export const watchCommands: Command[] = [
  warn,
  timeout,
  kick,
  ban,
  purge,
  caseCommand,
  history,
  moderation,
];
export const watchButtons: ButtonHandler[] = [undoButton];
